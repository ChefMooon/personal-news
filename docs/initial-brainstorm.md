# Personal News Initial Brainstorm

*Create a dashboard that shows all the new information I care about*

**Suggested stack:**
- Electron + React + Tailwind + shadcn/ui
- better-sqlite3 (database)
- electron-builder (packaging/distribution)

## Basic Requirements
- Able to be modular -> users can decide what information collected
- Users able to customize information on the homepage
- Must be built modular so it is easy to add  future data sources

**Data Sources**
- YouTube
	- Data: Upcoming Live streams, past videos
	- Create a system to keep `YouTube v3 API` calls as few as possible
		- Initial data uses rss feed information to get data about  channel videos
		- If new data is detected uses YouTube v3 API key to get details about channel info
- Useful Reddit Posts
	- Must figure out a way to save useful posts I find to be easily referenced later
- Personal Data Source
	- Not sure if this should be a separate application, but this needs to be able to read its data.
	- Reddit: Create a python script that will grab the most popular posts for the past week about subReddits I am interested in and save them somewhere/somehow