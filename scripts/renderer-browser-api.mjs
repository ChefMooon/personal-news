// Keep this function closure-free so Vite and Playwright can serialize the same adapter.
export function installRendererBrowserApi(fixtures) {
  const calls = [];
  const apiErrors = [];
  const listeners = new Map();
  const settings = {
    weather_enabled: "true",
    sports_enabled: "true",
    saved_posts_enabled: "true",
    reddit_digest_enabled: "true",
    astronomy_view_config: "",
    // Generic settings:get returns null for a missing database setting in the
    // real app. Seed the page preferences that are read on initial navigation.
    youtube_page_view_mode: "flat",
    youtube_page_density_by_mode: JSON.stringify({
      flat: "detailed",
      carousel: "detailed",
      grouped: "detailed",
    }),
    youtube_page_hide_watched: "false",
    reddit_digest_page_view_mode: "columns",
    reddit_digest_view_config: JSON.stringify({
      sort_by: "score",
      sort_dir: "desc",
      group_by: "subreddit",
      layout_mode: "columns",
    }),
  };
  for (const [key, value] of Object.entries(fixtures.widgetConfigs)) {
    settings[key] = JSON.stringify(value);
  }
  let dashboardViews = {
    view_order: fixtures.views.map((view) => view.id),
    views: Object.fromEntries(fixtures.views.map((view) => [view.id, view])),
  };
  let sidebarConfig = {
    itemOrder: [
      "dashboard",
      "youtube",
      "reddit-digest",
      "saved-posts",
      "sports",
      "weather",
      "astronomy",
      "scripts",
      "settings",
    ],
    hiddenItemIds: [],
    collapsed: false,
  };
  const supportedEvents = new Set([
    "app:showTrayHint",
    "reddit:ntfyIngestComplete",
    "updates:status",
    "reddit:updated",
    "reddit:digestViewedChanged",
    "window:stateChanged",
    "scripts:updated",
    "scripts:runComplete",
    "scripts:output",
    "devTestData:updated",
    "youtube:updated",
    "youtube:videoWatchedChanged",
    "sports:dataUpdated",
    "sports:fetchWarning",
    "weather:updated",
    "astronomy:updated",
  ]);
  const reportUnsupported = (message) => {
    apiErrors.push(message);
    console.error(`[renderer-browser] ${message}`);
    let banner = document.getElementById("renderer-browser-api-errors");
    if (!banner) {
      banner = document.createElement("aside");
      banner.id = "renderer-browser-api-errors";
      Object.assign(banner.style, {
        position: "fixed",
        inset: "8px 8px auto auto",
        zIndex: "2147483647",
        maxWidth: "min(640px, calc(100vw - 16px))",
        padding: "12px 16px",
        border: "2px solid #b91c1c",
        borderRadius: "8px",
        background: "#fff1f2",
        color: "#881337",
        font: "13px/1.4 ui-monospace, monospace",
        whiteSpace: "pre-wrap",
        boxShadow: "0 4px 20px #0003",
        pointerEvents: "none",
      });
      document.body.append(banner);
    }
    banner.textContent = `Browser preview API error\n${apiErrors.join("\n")}`;
  };
  const rejectUnsupported = (message) => {
    reportUnsupported(message);
    return Promise.reject(new Error(message));
  };
  const teamEvents = (teamId) => {
    const matching = fixtures.sports.events.filter(
      (event) => event.homeTeamId === teamId || event.awayTeamId === teamId,
    );
    return {
      last: matching.filter((event) => event.status === "FT"),
      next: matching.filter((event) => event.status !== "FT"),
    };
  };
  const viewedAnalytics = (posts) => {
    const viewedPosts = posts.filter((post) => post.viewed_at !== null);
    const trendByDay = new Map();
    const trendCutoff = Math.floor(fixtures.now / 1000) - 6 * 24 * 60 * 60;
    for (const post of viewedPosts) {
      if (post.viewed_at < trendCutoff) continue;
      const day = new Date(post.viewed_at * 1000).toISOString().slice(0, 10);
      trendByDay.set(day, (trendByDay.get(day) ?? 0) + 1);
    }
    const total = posts.length;
    const viewed = viewedPosts.length;
    return {
      total,
      viewed,
      unviewed: total - viewed,
      viewed_rate: total > 0 ? viewed / total : 0,
      trend: [...trendByDay]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([day, viewed_count]) => ({ day, viewed_count })),
    };
  };
  const invoke = (channel, ...args) => {
    calls.push({ kind: "invoke", channel, args });
    if (channel === "devTestData:getStatus")
      return Promise.resolve({
        available: true,
        active: true,
        latestVersion: fixtures.devTestDataVersion,
        appliedVersion: fixtures.devTestDataVersion,
        updateAvailable: false,
      });
    if (channel === "settings:get") {
      if (Object.hasOwn(settings, args[0]))
        return Promise.resolve(settings[args[0]]);
      // The production settings:get handler returns null for absent keys.
      return Promise.resolve(null);
    }
    if (channel === "settings:set") {
      settings[args[0]] = args[1];
      return Promise.resolve(true);
    }
    if (channel === "settings:setDashboardViews") {
      dashboardViews = args[0]?.state ?? args[0] ?? dashboardViews;
      return Promise.resolve({ ok: true });
    }
    if (channel === "settings:setSidebarConfig") {
      sidebarConfig = args[0] ?? sidebarConfig;
      return Promise.resolve({ ok: true });
    }
    if (channel === "settings:getYouTubeViewConfig") {
      return Promise.resolve(fixtures.presetConfigs.youtube);
    }
    if (channel === "settings:setYouTubeViewConfig") {
      settings[`youtube_view_config:${args[0]}`] = JSON.stringify(args[1]);
      return Promise.resolve(true);
    }
    if (channel === "reddit:getDigestPosts") {
      const request = args[0] ?? {};
      return Promise.resolve(
        fixtures.posts.filter(
          (post) =>
            (!request.week_start_date ||
              post.week_start_date === request.week_start_date) &&
            (!request.hide_viewed || post.viewed_at === null),
        ),
      );
    }
    if (channel === "reddit:getDigestViewedAnalytics") {
      const request = args[0] ?? {};
      const matching = fixtures.posts.filter((post) => {
        if (
          request.week_start_date &&
          post.week_start_date !== request.week_start_date
        )
          return false;
        if (
          request.week_start_dates?.length &&
          !request.week_start_dates.includes(post.week_start_date)
        )
          return false;
        if (
          request.subreddit_filter?.length &&
          !request.subreddit_filter.includes(post.subreddit)
        )
          return false;
        if (
          request.search?.trim() &&
          !post.title
            .toLowerCase()
            .includes(request.search.trim().toLowerCase())
        )
          return false;
        if (request.hide_viewed && post.viewed_at !== null) return false;
        return true;
      });
      return Promise.resolve(viewedAnalytics(matching));
    }
    if (channel === "reddit:getSavedViewedAnalytics") {
      const request = args[0] ?? {};
      const matching = fixtures.savedPosts.filter((post) => {
        if (
          request.subreddit_filter?.length &&
          !request.subreddit_filter.includes(post.subreddit)
        )
          return false;
        if (
          request.source_filter?.length &&
          !request.source_filter.includes(post.source)
        )
          return false;
        if (
          request.tag_filter?.length &&
          !request.tag_filter.some((tag) => post.tags.includes(tag))
        )
          return false;
        if (
          request.no_tags_only &&
          Array.isArray(post.tags) &&
          post.tags.length > 0
        )
          return false;
        if (
          request.search?.trim() &&
          !`${post.title} ${post.body} ${post.note}`
            .toLowerCase()
            .includes(request.search.trim().toLowerCase())
        )
          return false;
        return true;
      });
      return Promise.resolve(viewedAnalytics(matching));
    }
    if (channel === "reddit:getSavedPosts") {
      const request = args[0] ?? {};
      let posts = fixtures.savedPosts.filter((post) => {
        if (request.hide_viewed && post.viewed_at !== null) return false;
        if (
          request.subreddit_filter?.length &&
          !request.subreddit_filter.includes(post.subreddit)
        )
          return false;
        if (
          request.tag_filter?.length &&
          !request.tag_filter.some((tag) => post.tags.includes(tag))
        )
          return false;
        if (
          request.source_filter?.length &&
          !request.source_filter.includes(post.source)
        )
          return false;
        if (
          typeof request.search === "string" &&
          request.search &&
          !`${post.title} ${post.body} ${post.note}`
            .toLowerCase()
            .includes(request.search.toLowerCase())
        )
          return false;
        return true;
      });
      if (request.sort_dir === "asc") posts = [...posts].reverse();
      const total = posts.length;
      return Promise.resolve({
        posts: posts.slice(
          request.offset ?? 0,
          (request.offset ?? 0) + (request.limit ?? 50),
        ),
        total,
      });
    }
    if (channel === "youtube:getVideos")
      return Promise.resolve(
        fixtures.youtube.videos.filter((video) => video.channel_id === args[0]),
      );
    if (channel === "youtube:getVideosFiltered") {
      const options = args[0] ?? {};
      let videos = fixtures.youtube.videos.filter((video) => {
        if (options.channelId && video.channel_id !== options.channelId)
          return false;
        if (
          options.mediaTypes?.length &&
          !options.mediaTypes.includes(video.media_type)
        )
          return false;
        if (options.hideWatched && video.watched_at !== null) return false;
        if (
          typeof options.search === "string" &&
          options.search &&
          !video.title.toLowerCase().includes(options.search.toLowerCase())
        )
          return false;
        return true;
      });
      if (options.sortDir === "asc") videos = [...videos].reverse();
      const total = videos.length;
      return Promise.resolve({
        videos: videos.slice(
          options.offset ?? 0,
          (options.offset ?? 0) + (options.limit ?? 50),
        ),
        total,
      });
    }
    if (channel === "sports:getTodayEvents")
      return Promise.resolve(
        fixtures.sports.todayEvents.filter(
          (event) => event.sport === args[0]?.sport,
        ),
      );
    if (channel === "sports:getTeamEvents")
      return Promise.resolve(teamEvents(args[0]?.teamId));
    if (channel === "sports:getLeagues")
      return Promise.resolve(
        fixtures.sports.leagues.filter(
          (league) => league.sport === args[0]?.sport,
        ),
      );
    if (channel === "sports:getEventDetails")
      return Promise.resolve(fixtures.sports.details[args[0]?.eventId] ?? null);
    if (channel === "weather:getSnapshot")
      return Promise.resolve(
        args[0] === fixtures.weather.snapshot.location.id
          ? fixtures.weather.snapshot
          : null,
      );
    if (channel === "astronomy:getSnapshot")
      return Promise.resolve(
        args[0] === fixtures.astronomy.locationId ? fixtures.astronomy : null,
      );

    const defaults = {
      "window:getState": { isMaximized: false },
      "updates:getStatus": {
        state: "not-available",
        currentVersion: "browser-test",
      },
      "scripts:getNotifications": [],
      "scripts:getAll": [],
      "settings:getTheme": { id: "system", tokens: null },
      "settings:getNotificationPrefs": {
        desktopNotificationsEnabled: true,
        weather: { badWeather: true },
        youtube: { newVideo: true, liveStart: true },
        savedPosts: { syncSuccess: true },
        redditDigest: { runSuccess: true, runFailure: true },
        scriptManager: {
          autoRunSuccess: true,
          autoRunFailure: true,
          startupWarning: true,
        },
      },
      "settings:getSidebarConfig": sidebarConfig,
      "settings:getSidebarConfigSync": sidebarConfig,
      "settings:getDashboardViews": dashboardViews,
      "settings:getSportsSettings": {
        pollIntervalMinutes: 60,
        startupRefreshStaleMinutes: 60,
      },
      "settings:updateSportsSettings": {
        pollIntervalMinutes: 60,
        startupRefreshStaleMinutes: 60,
      },
      "settings:getYouTubeApiKeyStatus": { configured: false },
      "themes:list": [],
      "reddit:getDigestWeeks": fixtures.weeks,
      "reddit:getSavedPostsSummary": fixtures.savedPosts.map((post) => ({
        post_id: post.post_id,
        title: post.title,
        permalink: post.permalink,
        subreddit: post.subreddit,
        source: post.source,
        saved_at: post.saved_at,
      })),
      "reddit:getAllTags": fixtures.savedTags,
      "reddit:getViewedAnalytics": viewedAnalytics(fixtures.posts),
      "reddit:getNtfyStaleness": {
        lastPolledAt: null,
        isStale: false,
        topicConfigured: false,
        summary: null,
      },
      "youtube:getChannels": fixtures.youtube.channels,
      "sports:getTrackedTeams": fixtures.sports.teams,
      "sports:getStatus": fixtures.sports.status,
      "weather:getLocations": [fixtures.weather.snapshot.location],
      "weather:getSettings": {
        pollIntervalMinutes: 30,
        defaultLocationId: fixtures.weather.snapshot.location.id,
        temperatureUnit: "celsius",
        windSpeedUnit: "kmh",
        precipitationUnit: "mm",
        timeFormat: "system",
        showAlertsInWidgets: true,
        thresholds: {
          rainMm: 10,
          snowCm: 5,
          windKph: 45,
          freezeTempC: 0,
          heatTempC: 32,
        },
      },
      "weather:getStatus": {
        locationCount: 1,
        lastFetchedAt: fixtures.weather.snapshot.fetchedAt,
        staleLocationCount: 0,
      },
      "astronomy:getSettings": { enabled: true, pollIntervalMinutes: 60 },
      "astronomy:getStatus": {
        locationCount: 1,
        cachedLocationCount: 1,
        lastCalculatedAt: fixtures.astronomy.calculatedAt,
        enabled: true,
      },
    };
    if (Object.hasOwn(defaults, channel))
      return Promise.resolve(defaults[channel]);
    return rejectUnsupported(`Unhandled browser shim IPC: ${channel}`);
  };
  Object.defineProperty(window, "__rendererBrowserCalls", { value: calls });
  Object.defineProperty(window, "__rendererBrowserApiErrors", {
    value: apiErrors,
  });
  Object.defineProperty(window, "__rendererBrowserFixtures", {
    value: { views: fixtures.views, evidence: fixtures.fixtureEvidence },
  });
  Object.defineProperty(window, "api", {
    configurable: false,
    value: {
      invoke,
      on(channel, callback) {
        calls.push({ kind: "on", channel });
        if (!supportedEvents.has(channel)) {
          reportUnsupported(`Unhandled browser shim event: ${channel}`);
          return () => {};
        }
        const callbacks = listeners.get(channel) ?? new Set();
        callbacks.add(callback);
        listeners.set(channel, callbacks);
        return () => callbacks.delete(callback);
      },
      send(channel, ...args) {
        return invoke(channel, ...args);
      },
    },
  });
}
