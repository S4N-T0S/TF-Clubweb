## [OG] - About the OG Club

The 'Original Goats' [OG] is a community of dedicated, high-skill players in The Finals. We are actively looking for members who share our passion for competitive play and good sportsmanship.

+++How to Join+++

### Minimum Requirements

To be considered for membership, applicants should meet the following criteria:

*   **Community Presence:** Be an active and known member within The Finals community.
*   **Competitive Rank:** Have finished at least a Diamond rank within the last two competitive seasons.
*   **Good Reputation:** Be known as a respectable and non-toxic player. The use of exploits or cheating is strictly forbidden.

*An exception to the rank requirement may be made for established content creators, community leaders, or retired professional players.*

### Community Expectations

Please note the following rules of conduct, which apply to all members:

1.  **Fair Play:** Members are not expected to help eachother in public matches. Do whatever you like, do not get upset if you're griefed by a fellow member.
2.  **Perpetual Requirements:** The standards listed above are continuous. Failure to uphold them during your time in the club may result in removal.
3.  **Vouching System:** While meeting the requirements makes you eligible, final acceptance often requires vouches from existing OG members.

---

### How to Apply

If you meet these requirements and are interested in joining, please send a direct message on Discord to one of our recruiters.
Discord username: **tsa.gov**

In your message, please briefly introduce yourself and link to your profile on this dashboard.

+++Club Governance+++

For simplicity and to foster a connected environment, the club operates directly out of the Ruby Grind Discord server.

While our club has designated admins who hold power to make decisions, we are founded on the principle of community governance. Any member of the OG Club is free to make an appeal regarding an administrative decision.

At that point, the final decision will be made democratically by the OG Club members via a poll. This ensures that while our admins can lead effectively, the ultimate authority rests with the community.

## [TIPS] - Tips & Tricks

Here are a few tips to help you get the most out of the dashboard.

+++Advanced Searching+++

The search bars in this dashboard support a powerful syntax to help you find exactly what you're looking for. The rules are consistent everywhere.

*   **Exact Club Search**
    To find players in one specific club, enclose the club tag in full brackets.
    *   Example: `[OG]` will only show members of the [OG] club.

*   **Partial Club Search (Starts With)**
    To find clubs that start with certain letters, use an opening bracket.
    *   Example: `[OG` will show members from clubs like [OG], [OGRE], etc.

*   **Partial Club Search (Ends With)**
    To find clubs that end with certain letters, use a closing bracket.
    *   Example: `G]` will show members from clubs like [OG], [FROG], etc.

*   **No Club Search**
    To find all players who are not currently in a club, simply search for empty brackets.
    *   Example: `[]`

*   **Combined Search**
    You can combine any club syntax with a player name to narrow down your results. The order doesn't matter.
    *   Example: `[OG] 00` finds players named "00" within the [OG] club.
    *   Example: `[] et` finds players named "et" who are not in a club.

*   **General Search**
    If you search without any brackets, the query will match text found in a player's Embark ID, their linked platform names (Steam, PSN, Xbox), or their club tag.
    *   Example: `bali` will find the player `Balise#2431`, a player with the Steam name `Balius`, or even a player in a club like `[BALI]`.

## [API] - API Documentation

This dashboard is powered by a public API developed by us. Below are the details for developers who wish to interact with the data programmatically.

#### Core Concepts

*   **Seasons:** The API's data is partitioned by "seasons". Each season has a unique `id` and `name`. The frontend will need to allow users to select a season, especially for viewing player graphs. The current season is `7`. (as this is writen)
*   **Player Identity:** A player is identified by an "Embark ID" (e.g., `Username#1234`). Players can change their Embark ID. The backend tracks these changes using a permanent, internal ID. API responses will always provide the player's *current* Embark ID, along with their name change history where relevant.
*   **Public Authentication:** The `/graph` endpoint is a POST request and requires a public auth token to be sent in the request body. (This endpoint still has token in case of floods in future)

---

#### 1. Get Leaderboard

*   **Endpoint:** `GET /leaderboard`
*   **Auth:** None.
*   **Purpose:** Fetches the current state of the main "Ranked" leaderboard. The backend caches this data heavily.
*   **Response Structure:**
    ```typescript
    interface LeaderboardResponse {
      data: PlayerEntry[];
      source: 'kv-cache' | 'kv-cache-fallback';
      timestamp: number; // Unix timestamp of the data
      expiresAt: number; // The absolute Unix timestamp when the cache is considered stale.
      responseTime: number;
    }

    interface PlayerEntry {
      rank: number;
      change: number; // Rank change since last update
      name: string; // Embark ID
      leagueNumber: number;
      rankScore: number;
      steamName?: string | null;
      psnName?: string | null;
      xboxName?: string | null;
      clubTag?: string | null;
    }
    ```

#### 2. Get Player History Graph

*   **Endpoint:** `POST /graph`
*   **Auth:** Required.
*   **Purpose:** Fetches a specific player's rank and score history for a given season. This is the primary endpoint for building player profile pages with historical graphs.
*   **Request Body:**
    ```json
    {
      "embarkId": "00#0000", // A player's Embark ID (current or historical)
      "seasonId": 7, // Optional. Defaults to the current season if not provided.
      "token": "not-secret" // The required auth token.
    }
    ```
*   **Success (200 OK) Response Structure:**
    ```typescript
    interface GraphResponse {
      // The player's most current known Embark ID for the *requested* season.
      currentEmbarkId: string;

      // A chronological feed of all significant events for this player in this season.
      // This includes 'NAME_CHANGE', 'CLUB_CHANGE', 'SUSPECTED_BAN', and 'RS_ADJUSTMENT' events.
      // This field replaces the previous `nameHistory` field, as `NAME_CHANGE` events are now part of this array.
      // The structure of each entry is identical to the `EventEntry` from the main `/events` endpoint.
      events: EventEntry[];
      
      // The season ID for which data is being returned.
      seasonId: number;
      
      // A list of all seasons this player has data for. Use this to populate a season selector dropdown.
      availableSeasons: {
        id: number;
        name: string;
        // The player's most current Embark ID for THAT specific season.
        // Use this ID when making a subsequent graph request for that season.
        embarkId: string;
      }[];
      
      // The core time-series data for the graph.
      data: {
        rank: number;
        rankScore: number;
        timestamp: number; // Unix timestamp
        scoreChanged: boolean; // True if the score is different from the previous data point. Useful for highlighting changes on a graph.
      }[];
    }
    ```
*   **Not Found (404) Response Structure:**
    This occurs if the player has no data for the *requested* season. The `availableSeasons` key is still returned if the player was found in other seasons, which is useful for redirecting the user.
    ```typescript
    interface GraphNotFoundResponse {
      error: string; // e.g., "Not Found: Player has no data recorded for Season 7."
      embarkId: string; // The ID that was searched for.
      seasonId: number; // The season that was searched for.
      availableSeasons: {
        id: number;
        name: string;
        // The player's most current Embark ID for THAT specific season.
        // Use this ID when making a subsequent graph request for that season.
        embarkId: string;
      }[];
    }
    ```

#### 3. Get Recent Events

*   **Endpoint:** `GET /events/:seasonId?`
*   **Auth:** None.
*   **Purpose:** Fetches a feed of all significant player events (name changes, suspected bans, etc.) for a given season. This is for a live "event feed" on the site. If `:seasonId` is omitted, it defaults to the current season.
*   **Path Parameters:**
*   `seasonId` (optional, number): The ID of the season to fetch events for (e.g., `7`). Only seasons with event tracking support (Season 7 and newer) will return data.
*   **Response Structure:**
    ```typescript
    interface EventsResponse {
      data: EventEntry[];
      source: 'db';
      timestamp: number; // Unix timestamp of when the response was generated.
    }

    // Generic Event structure. The `details` object changes based on `event_type`.
    interface EventEntry {
      id: number; // Unique ID for the event.
      event_type: 'NAME_CHANGE' | 'SUSPECTED_BAN' | 'RS_ADJUSTMENT' | 'CLUB_CHANGE';
      start_timestamp: number; // Unix timestamp when the event occurred.
      // For `SUSPECTED_BAN` events, this marks the time the player reappeared on the leaderboard.
      // A non-null value indicates the ban/disappearance event is resolved. This could mean the
      // player was unbanned, or they have climbed back onto the leaderboard after a significant
      // rank score loss that was initially (and incorrectly) flagged as a ban.
      end_timestamp: number | null;
      current_embark_id: string; // The player's current name.
      details: NameChangeDetails | SuspectedBanDetails | RsAdjustmentDetails | ClubChangeDetails;
    }
    ```
*   **Event `details` Payloads:**

    1.  **`NAME_CHANGE`**: A player changed their Embark ID.
        ```typescript
        interface NameChangeDetails {
          old_name: string;
          new_name: string;
          rank: number;
          rank_score: number;
          old_club_tag: string | null;
          new_club_tag: string | null;
        }
        ```

    2.  **`SUSPECTED_BAN`**: A high-ranked player disappeared from the leaderboard under suspicious circumstances.
        ```typescript
        interface SuspectedBanDetails {
          last_known_name: string;
          last_known_rank: number;
          last_known_rank_score: number;
          last_known_club_tag: string | null;
          // The following fields are ONLY present if the event is resolved (i.e., end_timestamp on the parent EventEntry is not null).
          reappeared_at_rank?: number;
          reappeared_at_rank_score?: number;
          // This field is ONLY present if the player reappeared with a different name.
          // When present, it signifies that a name change occurred while the player was off-leaderboard,
          // resolving the ban event. 'last_known_name' acts as the old name, and 'reappeared_as_name' is the new name.
          reappeared_as_name?: string;
        }
        // NOTE: An event of this type is considered "resolved" or "over" when its `end_timestamp`
        // is set. This signifies the player has reappeared on the ranked leaderboard. When this happens,
        // the `details` object is expanded with their rank and score upon returning.
        ```

    3.  **`RS_ADJUSTMENT`**: A player's Rank Score changed by an unusually large amount between updates. This can happen in two ways, distinguished by the `is_off_leaderboard` flag.
        ```typescript
        // A discriminated union is used for this event type.
        // Check for the existence and value of `is_off_leaderboard` to know which payload you received.
        type RsAdjustmentDetails = OnLeaderboardAdjustmentDetails | OffLeaderboardAdjustmentDetails;
        
        // --- CASE 1: Player remains ON the leaderboard ---
        // Occurs when a player's score changes dramatically but they are still on the ranked leaderboard.
        interface OnLeaderboardAdjustmentDetails {
          is_off_leaderboard?: false; // This flag will be absent or explicitly false.
          name: string;
          change: number; // e.g., -5000 or +4000
          old_score: number;
          new_score: number;
          old_rank: number;
          new_rank: number;
          club_tag: string | null;
        }
        
        // --- CASE 2: Player falls OFF the leaderboard ---
        // Occurs when a high-ranked player vanishes from the main ranked leaderboard but is still
        // detected on other leaderboards (e.g., World Tour). This implies a massive RS loss, not a ban.
        interface OffLeaderboardAdjustmentDetails {
          is_off_leaderboard: true;
          name: string;
          old_score: number;
          old_rank: number;
          // A calculated value representing the smallest possible score loss for the player to have fallen off the board.
          // This is useful for display (e.g., "Lost at least 4500 RS").
          minimum_loss: number;
          club_tag: string | null;
        }
        ```

    4.  **`CLUB_CHANGE`**: A player changed their club affiliation. The `is_mass_change` flag helps differentiate between a single player's action and a coordinated change involving multiple players (e.g., a club owner renaming the club tag).
        ```typescript
        interface ClubChangeDetails {
          name: string;
          old_club: string | null;
          new_club: string | null;
          rank: number; // The player's rank at the time of the change.
          rank_score: number; // The player's rank score at the time of the change.
          is_mass_change: boolean;
        }
        ```
---

## [SOURCE] - Open Source

I believe in transparency and community collaboration. For this reason, the frontend of this web application is fully open source. The backend API remains private for security and stability reasons.

You can view the code, report issues, or contribute on our GitHub repository:

-   **Frontend Repository:** [GitHub](https://github.com/s4n-t0s/TF-Clubweb)

I welcome and appreciate contributions from the community!