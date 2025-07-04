### **Backend API Context for Frontend Development**

You are an expert frontend developer. Your task is to help build a web application using the following backend API. The API provides leaderboard, player history, and event data for a game. Pay close attention to the data structures for the `/graph` and `/events` endpoints, as they have been significantly updated.

#### **Core Concepts**

*   **Seasons:** The API's data is partitioned by "seasons". Each season has a unique `id` and `name`. The frontend will need to allow users to select a season, especially for viewing player graphs. The current season is `7`. (as this is writen)
*   **Player Identity:** A player is identified by an "Embark ID" (e.g., `Username#1234`). Players can change their Embark ID. The backend tracks these changes using a permanent, internal ID. API responses will always provide the player's *current* Embark ID, along with their name change history where relevant.
*   **Public Authentication:** The `/graph` endpoint is a POST request and requires a public auth token to be sent in the request body. (This endpoint still has token in case of floods in future)

---

### **Public API Endpoint Reference**

#### **1. Get Leaderboard**

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

#### **2. Get Player History Graph**

*   **Endpoint:** `POST /graph`
*   **Auth:** Required.
*   **Purpose:** Fetches a specific player's rank and score history for a given season. This is the primary endpoint for building player profile pages with historical graphs.
*   **Request Body:**
    ```json
    {
      "embarkId": "PlayerName#1234", // A player's Embark ID (current or historical)
      "seasonId": 7, // Optional. Defaults to the current season if not provided.
      "token": "not-secret" // The required auth token.
    }
    ```
*   **Success (200 OK) Response Structure:**
    ```typescript
    interface GraphResponse {
      // The player's most current known Embark ID for this season.
      currentEmbarkId: string;

      // [NEW] A chronological feed of all significant events for this player in this season.
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
      availableSeasons: { id: number; name: string; }[]; // List of other seasons player was found in.
    }
    ```

#### **3. Get Recent Events**

*   **Endpoint:** `GET /events`
*   **Auth:** None.
*   **Purpose:** Fetches a feed of recent, significant player events like name changes, suspected bans, etc. This is for a live "event feed" on the site. The backend returns the last 5000 events.
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