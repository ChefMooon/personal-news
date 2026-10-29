# Security and privacy

## Risks to consider before using Personal News

Personal News keeps its database on your computer, but it connects to online services and can run Python scripts. These are the main risks, the protections the app provides, and the limits of those protections:

- **Someone with access to your device could read your interests and saved content.** Settings, followed channels and subreddits, watched/viewed state, saved links and notes, weather locations, and script run output are stored locally. The SQLite database is not encrypted by the app. The YouTube API key receives separate protection described below; other local data relies on your operating-system account, device encryption, and backup security.
- **Online services can learn what you request.** Enabled sources contact their providers; remote images contact their image hosts. HTTPS protects traffic in transit, but the receiving service still sees your IP address and request details. Custom ntfy servers and radio streams can use HTTP, which leaves traffic readable or modifiable in transit. Prefer HTTPS and services you trust.
- **A malicious source or link could try to exploit the app or mislead you.** The app restricts renderer scripts with a Content Security Policy, disables renderer Node.js integration, enables context isolation, checks IPC callers and permitted channels, and blocks navigation away from the app. External links are limited to HTTP(S) and open outside the app. Selected source requests also have deadlines, response-size limits, and redirect checks. These measures reduce exposure; they do not establish that content is trustworthy or prevent every exploit. Electron's renderer sandbox is currently disabled.
- **A Python script can act with your account's permissions.** Script Manager checks custom script paths against the configured script directory and starts the configured interpreter without a command shell. This limits accidental or manipulated execution paths, but scripts are not sandboxed: they can read or change files, start programs, and use the network. Scheduled scripts can run automatically. Only enable scripts and interpreters you trust, after reviewing their code and dependencies.

## Sensitive data: use, storage, and protection

### YouTube API key

The optional YouTube API key lets Personal News validate the key and retrieve YouTube data from Google's API. The app sends it to Google over HTTPS, including when validating a newly entered key. Anyone who obtains the key may consume its API quota or use the access allowed by its Google Cloud configuration.

Before saving a key, the app requires Electron's `safeStorage` encryption to be available. It encrypts the key and stores the encrypted value in the local settings database; it refuses to save it if that encryption is unavailable. The key status interface reveals only a suffix, and the generic settings interface excludes the stored key. The app decrypts the key when it needs to make requests.

This protection depends on the operating system and local account. It does not protect against all software running as your user or a compromised application or device. Restrict the key to the YouTube Data API in Google Cloud, apply compatible application restrictions, monitor quota use, and rotate it if exposed.

### Local settings, content, locations, and script output

The app stores settings and content in a SQLite database under its application data profile. This includes reading/viewing history recorded by the app, saved-post notes, configured locations and coordinates, and script settings and captured output. Script files remain in their configured filesystem locations. Some diagnostic data may also exist outside the database.

Local storage lets the app retain your preferences and show cached content, but it is not a private vault. Database files, associated SQLite files, backups, and diagnostics can disclose personal information. Script output can contain secrets printed by a script. ntfy diagnostics include the topic URL, received links, and notes; review logs before sharing troubleshooting output. Protect your device and backups, and avoid putting secrets in notes, URLs, script arguments, or output.

### Saved Posts and ntfy

The optional ntfy integration polls your configured server and topic for shared links and notes, then stores ingested posts locally and fetches supported post metadata. Your phone or other sharing client sends those messages to ntfy; Personal News reads them from that server. Adding a link directly in Personal News does not send it through ntfy, although retrieving its metadata still makes network requests.

The server operator can receive and retain shared messages and request information. A topic name is not a substitute for access control: on a server that permits public topic access, someone who knows or guesses the topic may read or publish messages. Use a trusted server and its appropriate access controls, choose a difficult-to-guess topic, and avoid sharing sensitive content through a public topic. Personal News does not provide end-to-end encryption for these messages. Disabling polling cannot retract messages already sent to the server.

### External sources, images, and links

YouTube, Reddit, sports providers, weather services, configured radio services, and image hosts receive requests needed for the features you use. For example, weather searches send your search text to Open-Meteo's geocoding service, and forecast and air-quality requests send the configured location's coordinates. Channel and subreddit requests reveal the content being requested. Services handle this information under their own policies.

The renderer permits HTTPS images from remote hosts, so viewing content can contact an image host even without opening its link. HTTP(S) link validation limits URL schemes; it does not certify a destination as safe. Links open in your system browser or external handler, where that application's privacy and security settings apply. Review enabled sources and integrations, and disable those you do not need.

## Keeping your installation safe

Install Personal News from a source you trust and keep the app, operating system, Python interpreter, and script dependencies updated. Restrict access to your operating-system account and app data, especially on shared computers. Review managed scripts and their schedules before enabling automatic runs.

These notes describe the current implementation, not an independent security audit or a guarantee. Application code, dependencies, operating-system protections, and third-party services can contain vulnerabilities or change over time.
