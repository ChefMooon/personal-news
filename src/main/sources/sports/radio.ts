import type { RadioStation, SportEvent } from '../../../shared/ipc-types'

// Use the round-robin DNS entry so requests are distributed across all available
// radio-browser.info nodes rather than hammering a single server that may be down.
const RADIO_BROWSER_BASE_URL = 'https://all.api.radio-browser.info/json/stations/search'
const STREAM_RESOLVE_TIMEOUT_MS = 7_000
const MAX_PLAYLIST_DEPTH = 2
const MAX_PLAYABLE_SEARCH_RESULTS = 8
const TEAM_SUFFIXES = new Set([
  'angels', 'astros', 'athletics', 'blue', 'blues', 'bruins', 'bulls', 'canadiens', 'capitals', 'cardinals',
  'cavaliers', 'celtics', 'chiefs', 'clippers', 'colts', 'cowboys', 'cubs', 'devils', 'dodgers', 'eagles',
  'flames', 'giants', 'heat', 'jets', 'kings', 'knicks', 'lakers', 'leafs', 'lightning', 'magic', 'mariners',
  'mets', 'nationals', 'nets', 'oilers', 'orioles', 'packers', 'padres', 'panthers', 'pelicans', 'penguins',
  'phillies', 'pirates', 'rangers', 'raptors', 'ravens', 'reds', 'red', 'rockets', 'royals', 'sabre', 'sabres',
  'saints', 'seahawks', 'senators', 'sharks', 'sox', 'spurs', 'stars', 'suns', 'thunder', 'tigers', 'twins',
  'warriors', 'white', 'wild', 'wolves', 'yankees'
])

type RadioBrowserStation = {
  stationuuid?: string
  name?: string
  url_resolved?: string
  homepage?: string
  favicon?: string
  country?: string
  countrycode?: string
  codec?: string
  bitrate?: number | string | null
  tags?: string
}

function normalizeContentType(value: string | null): string {
  return (value ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function isLikelyPlaylistUrl(value: string): boolean {
  return /\.(m3u8?|pls|asx|wax|wvx|xspf)(?:$|[?#])/i.test(value)
}

function isLikelyHlsUrl(value: string): boolean {
  return /\.m3u8(?:$|[?#])/i.test(value)
}

function isLikelyDirectAudioUrl(value: string): boolean {
  return /\.(mp3|aac|m4a|ogg|opus|flac)(?:$|[?#])/i.test(value)
}

function isHlsContentType(contentType: string): boolean {
  return contentType === 'application/vnd.apple.mpegurl'
    || contentType === 'application/x-mpegurl'
    || contentType === 'audio/mpegurl'
    || contentType === 'audio/x-mpegurl'
}

function isPlaylistContentType(contentType: string): boolean {
  return isHlsContentType(contentType)
    || contentType === 'audio/x-scpls'
    || contentType === 'application/pls+xml'
    || contentType === 'video/x-ms-asf'
    || contentType === 'application/xspf+xml'
    || contentType === 'application/pls+xml'
}

function isDirectPlayableContentType(contentType: string): boolean {
  if (!contentType) {
    return false
  }

  if (isPlaylistContentType(contentType)) {
    return false
  }

  return contentType.startsWith('audio/') || contentType === 'application/ogg'
}

function parsePlaylistUrls(body: string, baseUrl: string): string[] {
  const results: string[] = []
  const seen = new Set<string>()

  const pushCandidate = (value: string): void => {
    const trimmed = value.trim()
    if (!trimmed) {
      return
    }

    try {
      const candidate = normalizeRemoteUrl(new URL(trimmed, baseUrl).toString())
      if (!candidate || seen.has(candidate)) {
        return
      }

      seen.add(candidate)
      results.push(candidate)
    } catch {
    }
  }

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const plsMatch = trimmed.match(/^File\d+=(.+)$/i)
    if (plsMatch?.[1]) {
      pushCandidate(plsMatch[1])
      continue
    }

    const asxMatch = trimmed.match(/href\s*=\s*["']([^"']+)["']/i)
    if (asxMatch?.[1]) {
      pushCandidate(asxMatch[1])
      continue
    }

    const xspfMatch = trimmed.match(/<location>([^<]+)<\/location>/i)
    if (xspfMatch?.[1]) {
      pushCandidate(xspfMatch[1])
      continue
    }

    if (/^https?:\/\//i.test(trimmed)) {
      pushCandidate(trimmed)
    }
  }

  return results
}

function getCodecScore(codec: string | null): number {
  const normalized = codec?.trim().toLowerCase() ?? ''
  if (normalized === 'mp3' || normalized === 'mpeg') {
    return 6
  }

  if (normalized === 'aac' || normalized === 'aac+' || normalized === 'aacp') {
    return 5
  }

  if (normalized === 'ogg' || normalized === 'opus') {
    return 4
  }

  return 0
}

function getStationPriority(station: RadioStation): number {
  let score = getCodecScore(station.codec)

  if (station.countryCode?.toUpperCase() === 'US' || station.countryCode?.toUpperCase() === 'CA') {
    score += 1
  }

  if (station.bitrate && station.bitrate > 0 && station.bitrate <= 256) {
    score += 1
  }

  if (isLikelyDirectAudioUrl(station.urlResolved)) {
    score += 3
  }

  if (isLikelyPlaylistUrl(station.urlResolved)) {
    score -= isLikelyHlsUrl(station.urlResolved) ? 12 : 5
  }

  return score
}

async function probeStream(url: string): Promise<Response> {
  // First try a HEAD request — it avoids downloading body bytes and works for
  // most direct-audio ICY/SHOUTcast streams.  Some servers reject HEAD (405) or
  // return unhelpful content-types with it, so we fall back to a small GET.
  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(STREAM_RESOLVE_TIMEOUT_MS),
      headers: {
        Accept: 'audio/*,*/*;q=0.8',
        'User-Agent': 'PersonalNews/1.1.0'
      }
    })
    // Only trust a HEAD response when it gives us a meaningful content-type.
    // A 405 or an empty content-type means we should fall through to GET.
    if (headResponse.ok || headResponse.status === 206) {
      const ct = normalizeContentType(headResponse.headers.get('content-type'))
      if (ct && ct !== 'application/octet-stream') {
        return headResponse
      }
    }
  } catch {
    // HEAD failed entirely — fall through to GET
  }

  return fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(STREAM_RESOLVE_TIMEOUT_MS),
    headers: {
      Accept: 'audio/*,*/*;q=0.8',
      'Icy-MetaData': '1',
      Range: 'bytes=0-2047',
      'User-Agent': 'PersonalNews/1.1.0'
    }
  })
}

function cancelResponseBody(response: Response): void {
  void response.body?.cancel().catch(() => {
  })
}

export async function resolveSportsRadioStream(url: string, depth = 0): Promise<string> {
  const normalizedUrl = normalizeRemoteUrl(url)
  if (!normalizedUrl) {
    throw new Error('Station stream URL is invalid.')
  }

  if (depth > MAX_PLAYLIST_DEPTH) {
    throw new Error('Station playlist redirected too many times.')
  }

  const response = await probeStream(normalizedUrl)
  const finalUrl = normalizeRemoteUrl(response.url) ?? normalizedUrl
  const contentType = normalizeContentType(response.headers.get('content-type'))
  const looksLikeIcyStream = response.headers.has('icy-name') || response.headers.has('icy-br')

  if (!response.ok) {
    cancelResponseBody(response)
    const statusMessages: Record<number, string> = {
      400: 'The stream server rejected the request (HTTP 400). Try a different station.',
      401: 'This stream requires authentication (HTTP 401).',
      403: 'Access to this stream is denied (HTTP 403). The station may be geo-restricted.',
      404: 'This stream URL no longer exists (HTTP 404). The station may have moved or gone offline.',
      410: 'This stream URL has been permanently removed (HTTP 410).',
      429: 'The stream server is rate-limiting requests (HTTP 429). Try again in a moment.',
      500: 'The stream server encountered an error (HTTP 500). Try a different station.',
      502: 'The stream server is unreachable (HTTP 502). Try a different station.',
      503: 'This stream is temporarily unavailable (HTTP 503). Try again shortly.',
      504: 'The stream server timed out (HTTP 504). Try a different station.'
    }
    throw new Error(statusMessages[response.status] ?? `Stream request failed with HTTP ${response.status}.`)
  }

  // Reject HLS regardless of whether it was identified by URL or content-type.
  // Some streams serve M3U8 under a generic URL, so the content-type check is
  // the only reliable guard once we have the response.
  if (isLikelyHlsUrl(finalUrl) || isHlsContentType(contentType)) {
    cancelResponseBody(response)
    throw new Error('This station uses HLS (adaptive streaming), which is not supported by this player.')
  }

  if (
    isDirectPlayableContentType(contentType)
    || ((contentType === '' || contentType === 'application/octet-stream') && (looksLikeIcyStream || isLikelyDirectAudioUrl(finalUrl)))
  ) {
    cancelResponseBody(response)
    return finalUrl
  }

  const body = await response.text()
  const playlistUrls = parsePlaylistUrls(body, finalUrl)

  for (const candidate of playlistUrls.slice(0, 5)) {
    try {
      return await resolveSportsRadioStream(candidate, depth + 1)
    } catch {
    }
  }

  if (isLikelyPlaylistUrl(finalUrl) || isPlaylistContentType(contentType)) {
    throw new Error('This station publishes a playlist, but no playable stream could be extracted.')
  }

  throw new Error('This station does not expose a supported audio stream.')
}

function normalizeRemoteUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildCityKeyword(teamName: string): string {
  const parts = teamName.trim().split(/\s+/)
  if (parts.length <= 1) {
    return teamName.trim()
  }

  const withoutSuffix = parts.filter((part, index) => {
    if (index === parts.length - 1 && TEAM_SUFFIXES.has(part.toLowerCase())) {
      return false
    }

    return true
  })

  return withoutSuffix.join(' ').trim() || teamName.trim()
}

function inferCountryCodes(_game: SportEvent): string[] {
  // Always search both US and CA — Canadian streams are often the only working
  // option for users in Canada, and US streams are frequently geo-restricted.
  return ['US', 'CA']
}

function getSearchTerms(game: SportEvent): string[] {
  return Array.from(
    new Set(
      [buildCityKeyword(game.homeTeam), buildCityKeyword(game.awayTeam), game.homeTeam, game.awayTeam].filter(
        (value) => value.trim().length > 0
      )
    )
  )
}

function mapStation(row: RadioBrowserStation): RadioStation | null {
  if (!row.stationuuid || !row.name || !row.url_resolved) {
    return null
  }

  const bitrateValue = typeof row.bitrate === 'number' ? row.bitrate : Number.parseInt(row.bitrate ?? '', 10)

  return {
    stationuuid: row.stationuuid,
    name: row.name,
    urlResolved: row.url_resolved,
    playableStreamUrl: null,
    favicon: normalizeRemoteUrl(row.favicon),
    country: row.country?.trim() || null,
    countryCode: row.countrycode?.trim() || null,
    codec: row.codec?.trim() || null,
    bitrate: Number.isFinite(bitrateValue) ? bitrateValue : null,
    tags: row.tags
      ? row.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      : []
  }
}

export async function searchSportsRadioStations(game: SportEvent): Promise<RadioStation[]> {
  const searches = getSearchTerms(game)
  const countryCodes = inferCountryCodes(game)
  const requests = searches.flatMap((name) =>
    countryCodes.map(async (countryCode) => {
      const params = new URLSearchParams({
        name,
        tags: 'sports',
        countrycode: countryCode,
        order: 'votes',
        reverse: 'true',
        limit: '20',
        hidebroken: 'true'
      })
      const response = await fetch(`${RADIO_BROWSER_BASE_URL}?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Radio Browser request failed with HTTP ${response.status}.`)
      }

      return response.json() as Promise<RadioBrowserStation[]>
    })
  )

  const settled = await Promise.allSettled(requests)
  const payloads = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

  if (payloads.length === 0) {
    throw new Error('Could not reach the radio station directory. Check your internet connection and try again.')
  }

  const desiredTerms = searches.map((entry) => normalizeSearchText(entry))
  const seen = new Set<string>()
  const stations: RadioStation[] = []

  for (const payload of payloads) {
    for (const row of payload) {
      const station = mapStation(row)
      if (!station || seen.has(station.stationuuid)) {
        continue
      }

      const haystack = normalizeSearchText(`${station.name} ${station.tags.join(' ')} ${station.country ?? ''}`)
      if (!desiredTerms.some((term) => haystack.includes(term) || term.includes(haystack))) {
        continue
      }

      seen.add(station.stationuuid)
      stations.push(station)
    }
  }

  const rankedStations = stations
    // Pre-filter obvious HLS URLs before the user even sees them. Any HLS that
    // slipped through (e.g. hidden behind a redirect) is caught at resolve-time
    // by resolveSportsRadioStream and produces a clear error message there.
    .filter((station) => !isLikelyHlsUrl(station.urlResolved))
    .sort((left, right) => {
      const scoreDiff = getStationPriority(right) - getStationPriority(left)
      if (scoreDiff !== 0) {
        return scoreDiff
      }

      const bitrateDiff = (right.bitrate ?? 0) - (left.bitrate ?? 0)
      if (bitrateDiff !== 0) {
        return bitrateDiff
      }

      return 0
    })

  return rankedStations.slice(0, MAX_PLAYABLE_SEARCH_RESULTS)
}