## Version 1.0 - devdoomscroll.dom

### User stories

| ID     | Title             | As a                   | I want                                         | So that                                 | Priority |
| ------ | ----------------- | ---------------------- | ---------------------------------------------- | --------------------------------------- | -------- |
| US-101 | Browse front page | Normal user            | to seamlessly scroll the front page            | I can see posts that interest me        | Must     |
| US-102 | Add interest      | Normal user            | to add a tag that interests me                 | I see posts that are related to the tag | Must     |
| US-103 | Remove interest   | Normal user            | to remove a tag from the displayed tags        | I see posts that are related to the tag | Must     |
| US-104 | Update page       | Normal (premium?) user | to have the ability to refresh/update the page | I see up-to-date posts                  | Could    |

### Requirements:

**Functional**:

- Requirements laid out in the version 1 (US-1xx) user stories
- Viewable on mobile and on desktop

**Non-functional**:

- Posts should be updated every 3 hours and saved to database
- When after update posts for certain tags are fetched from db, add them to redis cache
- Users interests are saved to cookies

**Constraints**:

- Use free resources as much as possible
- Adhere to site scraping rules and regulations

### Sources for posts

**Free**:

- dev.to
- Stack overflow
- Lobsters
- Github (show repos)
- Hacker news
- Bluesky
- RSS feeds

**Limited**:

- news sources:
  - https://github.com/public-apis/public-apis#news
  - Newsapi.org
  - NewsData.io
  - The guardian API
- Reddit
- linkedin?

Additional features:

- Ability to set infinity scroll or paginated
- User functionality, posts can be saved
- Add comments to posts
- Cross device interests (interests saved to database for user)
- Metrics to track how active a source is (how often new posts are created). Can then be used to update a certain source more frequently
