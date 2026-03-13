# Pathyatra - Presentation Blueprint

> A comprehensive slide-by-slide guide for presenting the Pathyatra bus transit navigation app.

---

## Slide 1: Title Slide

**Content:**
- **Title:** "Pathyatra - Smart Bus Transit Navigation for Nepal"
- **Subtitle:** "Find your bus. Plan your journey. Arrive with confidence."
- **Team members:** [Your names]
- **Date & Course Info**

**Visuals:**
- App logo/icon centered
- A subtle background of Kathmandu cityscape or a bus route map overlay
- Clean, minimal design with the app's primary color (#1FAE66 green, #2D7FF9 blue)

---

## Slide 2: Problem Statement

**Content:**
- Nepal's public bus transit system has **no centralized digital route information**
- Commuters rely on word-of-mouth or asking conductors to find the right bus
- No way to know which bus goes from point A to point B
- Tourists and newcomers are completely lost navigating the bus system
- Existing solutions (Google Maps) have **zero coverage** for local bus routes in Nepal

**Visuals:**
- A split image: confused commuter at a bus stop (left) vs. a clean app interface showing route guidance (right)
- Pain points as bullet icons with red X marks
- Optional: A quote from a real commuter about the difficulty

---

## Slide 3: Our Solution - Pathyatra

**Content:**
- **Pathyatra** = "Path" (English) + "Yatra" (Journey in Nepali) = "Journey Path"
- A mobile app that helps users find the right bus route between any two locations
- Key value propositions:
  - Search any destination on the map
  - Get the optimal bus route with walking directions to/from stops
  - View all available bus routes and their stops
  - Works in both **English and Nepali**
  - Dark mode and satellite map support

**Visuals:**
- App mockup/screenshot showing the main map screen with a planned route
- Feature highlight icons arranged around the phone mockup
- "Before Pathyatra" vs "After Pathyatra" comparison

---

## Slide 4: Live Demo / App Walkthrough

**Content:**
- Walk through the **3 main screens**:
  1. **Home (Map) Screen** - Interactive map, search destination, get directions
  2. **Routes Screen** - Browse all bus routes, view route details and stops on map
  3. **Settings Screen** - Toggle dark mode, switch language (EN/NE), map style

**Visuals:**
- Live demo on a phone/emulator OR
- Screen recordings/GIFs showing:
  - Searching for a destination
  - Getting bus route directions with walk + bus + walk segments
  - Browsing the routes list
  - Switching between English and Nepali
  - Toggling dark mode / satellite view

---

## Slide 5: System Architecture Overview

**Content:**
- **Three-tier architecture:**
  1. **Frontend** - React Native (Expo) mobile app
  2. **Backend** - Express.js REST API server
  3. **Database** - Supabase (PostgreSQL + PostGIS)
- **External Services:**
  - MapTiler - Map tiles, geocoding, driving directions
  - OSRM - Fallback routing engine (Open Source Routing Machine)

**Visuals:**
```
┌─────────────────────────────────────────────────────────────┐
│                      MOBILE APP                             │
│              React Native (Expo SDK 54)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Home /  │  │  Routes  │  │ Settings │                  │
│  │   Map    │  │  Browser │  │          │                  │
│  └────┬─────┘  └────┬─────┘  └──────────┘                  │
│       │              │                                      │
│  ┌────┴──────────────┴─────┐                                │
│  │    WebView (MapLibre)   │   ← MapTiler Tile Server       │
│  │    + MapTiler Geocoding │                                │
│  └─────────────┬───────────┘                                │
└────────────────┼────────────────────────────────────────────┘
                 │ HTTP REST API
┌────────────────┼────────────────────────────────────────────┐
│           EXPRESS.JS BACKEND (Port 4000)                     │
│  ┌─────────────┴───────────────┐                            │
│  │   /v1/trips/plan            │ ← Trip Planning Engine     │
│  │   /v1/stops/near            │ ← Nearby Stop Finder       │
│  │   /v1/routes/:id            │ ← Route Details + Geometry │
│  │   /v1/routes                │ ← All Routes Listing       │
│  └─────────────┬───────────────┘                            │
│                │                                            │
│  ┌─────────────┴───────────────┐                            │
│  │  MapTiler Directions API    │ ← Road-snapped geometries  │
│  │  OSRM Fallback             │ ← Circuit breaker pattern   │
│  └─────────────┬───────────────┘                            │
└────────────────┼────────────────────────────────────────────┘
                 │ Supabase JS Client
┌────────────────┼────────────────────────────────────────────┐
│           SUPABASE (PostgreSQL + PostGIS)                    │
│  ┌─────────────┴───────────────┐                            │
│  │  stations, platforms        │ ← Geo-indexed bus stops     │
│  │  routes, route_variants     │ ← Route definitions         │
│  │  route_variant_stops        │ ← Stop sequences            │
│  │  route_edges                │ ← Pre-computed road segments │
│  └─────────────────────────────┘                            │
│  PostGIS: ST_DWithin, ST_Distance (spatial queries)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Slide 6: Tech Stack - Why These Choices?

**Content:**

| Technology | What | Why We Chose It |
|---|---|---|
| **React Native (Expo SDK 54)** | Mobile framework | We already knew React; React Native uses the same component model and JSX syntax with minor differences (View instead of div, StyleSheet instead of CSS). Far better than learning Dart from scratch for Flutter |
| **Expo Router v6** | File-based navigation | Automatic routing from file structure (like Next.js), typed routes, zero config navigation setup |
| **Express.js** | Backend API | We had prior experience with Express. Lightweight, minimal boilerplate, perfect for REST APIs |
| **Supabase (PostgreSQL + PostGIS)** | Database & BaaS | Generous free tier (500MB DB, 1GB storage, 50K monthly active users). PostgreSQL with PostGIS extension for geospatial queries. Can be migrated to self-hosted PostgreSQL or AWS RDS for production scaling |
| **MapTiler (Free Tier)** | Maps, Geocoding, Directions | Free tier provides map tiles, geocoding (place search), and driving directions API. No credit card required. Provides both raster and vector tiles |
| **OSRM** | Fallback routing | Completely free, open-source routing engine. Acts as fallback when MapTiler is unavailable (circuit breaker pattern) |
| **TypeScript** | Type safety | Catches errors at compile time, better IDE support, self-documenting code |
| **React Native WebView** | Map rendering | Renders MapLibre GL maps inside the app via WebView, giving us full interactive map capabilities |

**Visuals:**
- Tech stack icons arranged in a layered diagram (Frontend / Backend / Database / External)
- Comparison table: "What we knew" vs "What we'd have to learn" (React vs Dart)

---

## Slide 7: Database Design (Supabase + PostGIS)

**Content:**
- **6 core tables** with spatial indexing:
  1. `stations` - Bus stops with lat/lon + auto-generated PostGIS `geography(Point, 4326)` column
  2. `platforms` - Boarding platforms at stations (left/right side of road)
  3. `routes` - Bus route definitions (name, is_loop, directionality)
  4. `route_variants` - Forward/reverse variants of each route
  5. `route_variant_stops` - Ordered stop sequence for each variant
  6. `route_edges` - **Pre-computed** road segments between consecutive stops (distance, duration, GeoJSON geometry)

- **Key PostGIS features used:**
  - `ST_DWithin()` - Find all stations within X meters of a point
  - `ST_Distance()` - Calculate exact distance between two geographic points
  - GiST spatial indexes for fast geospatial queries
  - Auto-generated geography columns from lat/lon

- **Row Level Security (RLS)** enabled on all tables

**Visuals:**
```
ER Diagram:

stations ──────┐
  (id, name,   │1
   lat, lon,   ├──────< platforms
   geom)       │       (id, station_id, name,
               │        side[L/R], lat, lon)
               │
               │
routes ────────┤
  (id, name,   │1
   is_loop,    ├──────< route_variants
   direction-  │       (id, variant_key,
   ality)      │        route_id, direction
               │        [forward/reverse],
               │        stop_count)
               │
               │        route_variants
               │              │1
               │              ├──────< route_variant_stops
               │              │       (variant_id, stop_sequence,
               │              │        station_id, platform_id)
               │              │
               │              ├──────< route_edges
               │                      (variant_id, from_seq, to_seq,
               │                       distance_m, duration_s,
               │                       line_geojson, source)
```

---

## Slide 8: The Routing Algorithm - User Perspective

**Content:**
- **What the user does:**
  1. Opens the app → sees their current location on the map
  2. Searches for a destination (e.g., "Ratnapark", "Boudhanath")
  3. Optionally sets a custom starting point (or uses GPS location)
  4. Taps "Directions"
  5. Gets a 3-segment journey plan:
     - **Walk** from your location to the nearest bus stop (blue line)
     - **Bus ride** along the route (green line)
     - **Walk** from the alighting stop to your destination (blue line)
  6. Sees boarding station name, alighting station name, route name, total distance, and estimated duration

**Visuals:**
- Step-by-step UI screenshots showing the user flow
- Final result mockup showing the 3-segment journey on the map
- Color-coded legend: Blue = Walking, Green = Bus

```
User Flow Diagram:

[Open App] → [See Map + Location] → [Search Destination]
                                            │
                                     [Tap on Result]
                                            │
                                   [Set "From" Location]
                                   (GPS or manual search)
                                            │
                                    [Tap "Directions"]
                                            │
                                  [See Journey Plan]
                                  ┌──────────────────┐
                                  │ 🚶 Walk 350m     │
                                  │ 🚌 Bus Route 21  │
                                  │    Board: Stop A  │
                                  │    Alight: Stop B │
                                  │ 🚶 Walk 200m     │
                                  │ Total: 45 min     │
                                  └──────────────────┘
```

---

## Slide 9: The Routing Algorithm - Developer Perspective (Part 1: Finding Candidates)

**Content:**
- **Step 1: Find Nearby Stations**
  - Uses PostGIS `ST_DWithin()` to find stations within 2.5km of origin AND destination
  - If none found, expands search radius to 5km
  - Returns up to 14 nearest stations sorted by distance

- **Step 2: Build Candidate Options**
  - For every combination of (origin station × destination station × route variant):
    - Check if both stations exist on the same route variant
    - Check stop sequence order (origin must come before destination, unless loop route)
    - Calculate approximate bus duration using pre-computed edge data
    - Calculate approximate walking time using Haversine distance / walking speed (1.3 m/s)
    - Compute total score = walk_time + bus_time + wait_penalty (5 min)

- **Step 3: Progressive Nearest-Stop Expansion**
  - Instead of testing all stations at once, incrementally expands from nearest to farthest
  - Stops as soon as valid candidates are found (optimization for speed)

**Visuals:**
```
Flowchart - Candidate Discovery:

    [User: Origin (lat,lon) + Destination (lat,lon)]
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
   [PostGIS: Find            [PostGIS: Find
    14 nearest stops          14 nearest stops
    within 2.5km              within 2.5km
    of ORIGIN]                of DESTINATION]
            │                       │
            └───────────┬───────────┘
                        ▼
              [Load ALL route variants
               + variant stops + edges]
                        │
                        ▼
        ┌───────────────────────────────┐
        │  For each (origin_stop,       │
        │    dest_stop, variant):       │
        │                               │
        │  ✓ Both on same variant?      │
        │  ✓ Origin before destination? │
        │  ✓ (Or loop route wrapping?)  │
        │                               │
        │  → Compute approx score:      │
        │    walk + bus + 5min wait     │
        └───────────────┬───────────────┘
                        ▼
              [Candidate Options List]
              (sorted by approx score)
```

---

## Slide 10: The Routing Algorithm - Developer Perspective (Part 2: Ranking & Selection)

**Content:**
- **Step 4: Build Evaluation Shortlist**
  - Take top 10 candidates by score
  - Also preserve the least-walking option per route (passengers prefer shorter walks even if bus takes longer)
  - Merge into shortlist of max 20 candidates

- **Step 5: Fast Candidate Ranking**
  - For each shortlisted candidate, compute more precise walking distances
  - Score = walking_to_boarding + bus_duration + walking_to_destination + 5min_wait - priority_bonus
  - Keep top 8 candidates for final evaluation

- **Step 6: Final Evaluation with Geometry**
  - Build actual bus segment geometry (road-snapped GeoJSON from pre-computed edges)
  - If edge data missing, fetch real-time driving directions from MapTiler API
  - If MapTiler fails, fall back to OSRM; if both fail, use straight-line Haversine fallback
  - Compute walking legs (straight-line displacement for pedestrians)
  - Select the **best** trip based on:
    - Lowest adjusted total score (time + walking)
    - For same route: prefer less walking
    - For similar scores (within 3 min): prefer less total walking

**Visuals:**
```
Flowchart - Ranking & Final Selection:

    [Candidate Options List]
                │
                ▼
    ┌───────────────────────┐
    │  SHORTLISTING         │
    │  • Top 10 by score    │
    │  • Best walk per route│
    │  • Max 20 total       │
    └───────────┬───────────┘
                ▼
    ┌───────────────────────┐
    │  FAST RANKING         │
    │  • Precise walk calc  │
    │  • Haversine distance │
    │  • Sort by adjusted   │
    │    total score        │
    │  • Keep top 8         │
    └───────────┬───────────┘
                ▼
    ┌───────────────────────┐
    │  FINAL EVALUATION     │
    │  For each candidate:  │
    │  • Build bus geometry  │
    │    (edges → MapTiler   │
    │     → OSRM → fallback)│
    │  • Build walk legs     │
    │  • Total = walk₁ +    │
    │    bus + walk₂ + wait │
    └───────────┬───────────┘
                ▼
    ┌───────────────────────┐
    │  BEST TRIP SELECTION  │
    │  Compare candidates:  │
    │  • Same variant →     │
    │    least walking wins │
    │  • Same route →       │
    │    balance walk/time  │
    │  • Different route →  │
    │    lowest score wins  │
    │  • Close scores →     │
    │    least walking wins │
    └───────────┬───────────┘
                ▼
        [Final Itinerary]
    ┌─────────────────────────┐
    │ Segment 1: Walk (blue)  │
    │ Segment 2: Bus (green)  │
    │ Segment 3: Walk (blue)  │
    │ + station names, ETA    │
    └─────────────────────────┘
```

---

## Slide 11: Key Algorithm Constants & Design Decisions

**Content:**

| Constant | Value | Why |
|---|---|---|
| `NEARBY_RADIUS_M` | 2,500m | Maximum walking distance users would accept to reach a bus stop |
| `EXPANDED_NEARBY_RADIUS_M` | 5,000m | Fallback for rural/sparse areas with fewer stops |
| `WALKING_SPEED_MPS` | 1.3 m/s | Average human walking speed (~4.7 km/h) |
| `WAIT_PENALTY_S` | 300s (5 min) | Estimated average wait time for a bus |
| `BUS_FALLBACK_SPEED_MPS` | 7.5 m/s | Average bus speed (~27 km/h) when no edge data available |
| `ORIGIN_NEARBY_LIMIT` | 14 | Max nearby stations to consider at origin |
| `MAX_SHORTLIST_SIZE` | 20 | Caps computation for shortlisting phase |
| `MAX_FINAL_CANDIDATE_EVALUATIONS` | 8 | Caps expensive final evaluation (API calls) |

- **Haversine Formula** used for all distance calculations (accounts for Earth's curvature)
- **Pre-computed route edges** avoid expensive real-time API calls for known segments
- **Circuit breaker pattern** on MapTiler: after 3 failures, skip for 5 minutes and use OSRM directly

**Visuals:**
- Haversine formula visualization on a sphere
- Circuit breaker state diagram: Closed → Open (after 3 failures) → Half-Open (after 5 min)

---

## Slide 12: Data Pipeline - How Transit Data Gets In

**Content:**
- **Step 1:** Transit data is prepared in a JSON file (`transit.json`) containing:
  - `stops[]` - All bus stations with lat, lon, name, and platform definitions
  - `routes[]` - All bus routes with stop sequences, directionality, loop info

- **Step 2:** `importTransit.js` script:
  - Validates data integrity (no duplicate stops, min 2 stops per route)
  - Upserts stations → platforms → routes → route_variants → route_variant_stops
  - Auto-generates forward + reverse variants for bidirectional routes

- **Step 3:** `precomputeRouteEdges.js` script:
  - For every consecutive stop pair on every variant:
    - Fetches actual driving directions from MapTiler API
    - Stores distance (meters), duration (seconds), and road geometry (GeoJSON LineString)
  - Uses a local file cache to avoid redundant API calls
  - These pre-computed edges make trip planning fast (no real-time API calls for known segments)

**Visuals:**
```
Data Pipeline Flowchart:

[transit.json]
  (manually curated
   bus stop & route data)
        │
        ▼
[importTransit.js]
  • Validate stops/routes
  • Upsert to Supabase
  • Generate forward/reverse variants
        │
        ▼
[Supabase DB]
  stations, platforms,
  routes, route_variants,
  route_variant_stops
        │
        ▼
[precomputeRouteEdges.js]
  • For each stop pair:
  • Fetch MapTiler driving directions
  • Store distance_m, duration_s, GeoJSON
  • Cache results locally
        │
        ▼
[route_edges table]
  Pre-computed road segments
  ready for trip planning
```

---

## Slide 13: Map Integration - MapTiler + WebView

**Content:**
- **MapTiler** provides three key services (all on free tier):
  1. **Map Tiles** - OpenStreetMap and satellite imagery rendered via MapLibre GL JS
  2. **Geocoding** (Nominatim) - Convert place names → coordinates (search functionality)
  3. **Directions API** - Get road-snapped driving/walking routes between points

- **How maps are rendered in the app:**
  - React Native WebView loads an HTML page with MapLibre GL JS
  - MapTiler tile URLs are injected with the API key
  - JavaScript bridge communicates between React Native and the WebView map
  - Supports default (OSM) and satellite map styles, toggled from settings

- **Map features:**
  - User location tracking (expo-location with GPS permissions)
  - Bus stop markers
  - Route polylines (color-coded: blue for walk, green for bus)
  - Interactive tap-to-select on the map
  - Search bar with autocomplete suggestions from MapTiler geocoding

**Visuals:**
- Screenshot of the map with a route displayed
- Diagram showing: App → WebView → MapLibre GL JS → MapTiler Tile Server
- Side-by-side: Default OSM style vs Satellite style

---

## Slide 14: App Features Deep Dive

**Content:**

### Bilingual Support (English + Nepali)
- Full translation system using React Context
- 40+ translated strings covering all UI text
- Language preference persisted in AsyncStorage
- Instantly switch without app restart

### Dark Mode
- System-wide dark/light theme toggle
- Theme state managed via React Context + AsyncStorage
- All screens and components respect theme colors

### Map Style Toggle
- Switch between OpenStreetMap (default) and Satellite imagery
- Preference saved locally

### Route Browser
- View all available bus routes in a searchable list
- Tap a route to see detailed stop-by-stop information
- Interactive map showing the full route shape (road-snapped geometry)
- Forward and reverse variant toggle

### Nearby Stops
- Automatically finds bus stops near your GPS location
- Shows distance to each stop

**Visuals:**
- Grid of 4-6 feature screenshots:
  - English vs Nepali side by side
  - Light mode vs Dark mode
  - Route list view → Route detail with map
  - Nearby stops view

---

## Slide 15: All Libraries & Dependencies

**Content:**

### Frontend Libraries
| Library | Purpose |
|---|---|
| `react-native@0.81.5` | Core mobile framework (New Architecture enabled) |
| `expo@54.0.33` | Managed workflow, build tooling, OTA updates |
| `expo-router@6.0.23` | File-based routing with typed routes |
| `react-native-webview@13.15.0` | Renders MapLibre GL maps inside the app |
| `expo-location@19.0.8` | GPS location access (fine + coarse) |
| `react-native-gesture-handler@2.28.0` | Touch gestures (swipe, pan, tap) |
| `react-native-reanimated@4.1.1` | Smooth 60fps animations |
| `react-native-screens@4.16.0` | Native screen containers for navigation |
| `react-native-safe-area-context@5.6.0` | Safe area insets (notch, status bar) |
| `react-native-svg@15.12.1` | SVG rendering for icons and graphics |
| `@react-native-async-storage/async-storage@2.2.0` | Persistent local key-value storage |
| `@expo/vector-icons@15.0.3` | Icon library (MaterialIcons, Ionicons, etc.) |
| `@react-navigation/bottom-tabs@7.4.0` | Bottom tab navigator |
| `@react-navigation/native@7.1.8` | Navigation core |
| `expo-haptics@15.0.8` | Haptic feedback on interactions |
| `expo-image@3.0.11` | Optimized image component |
| `expo-splash-screen@31.0.13` | Splash screen management |
| `react-native-worklets@0.5.1` | Worklet threading for reanimated |
| `typescript@5.9.2` | Static type checking |
| `eslint + eslint-config-expo` | Code linting |

### Backend Libraries
| Library | Purpose |
|---|---|
| `express@4.21.2` | HTTP server and REST API routing |
| `@supabase/supabase-js@2.57.0` | Supabase client for PostgreSQL + PostGIS queries |
| `cors@2.8.5` | Cross-origin resource sharing middleware |
| `dotenv@16.4.7` | Environment variable management |

### External Services (Free Tier)
| Service | Purpose |
|---|---|
| **MapTiler** | Map tiles (OSM + Satellite), Geocoding (place search), Directions API (road-snapped routes) |
| **OSRM** (project-osrm.org) | Open-source fallback routing engine, no API key needed |
| **Supabase** | Hosted PostgreSQL with PostGIS, authentication, row-level security, REST API auto-generation |

**Visuals:**
- Categorized icon grid: Frontend / Backend / External Services
- Highlight the "free tier" badge on MapTiler, Supabase, OSRM

---

## Slide 16: API Endpoints

**Content:**

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check - returns service status |
| `/v1/stops/near?lat=&lon=&radiusM=&limit=` | GET | Find nearby bus stations using PostGIS spatial query |
| `/v1/routes` | GET | List all available bus routes |
| `/v1/routes/:routeId?shapeVariantId=` | GET | Get route details with variants, stops, and road-snapped geometry |
| `/v1/trips/plan?fromLat=&fromLon=&toLat=&toLon=` | GET | **Core endpoint** - Plan a single-bus trip with walking + bus + walking segments |

- Trip planning endpoint returns:
  - Route name and variant direction
  - Boarding station + platform (with side: left/right)
  - Alighting station + platform
  - 3 segments with GeoJSON geometry: walk → bus → walk
  - Total distance (meters) and duration (seconds)

**Visuals:**
- API request/response example for `/v1/trips/plan`
- Show a sample JSON response with the 3 segments highlighted

---

## Slide 17: Current Limitations

**Content:**
1. **Single-bus routes only** - Cannot plan trips requiring transfers between buses
2. **No real-time bus tracking** - Shows routes but not live bus positions
3. **Manual transit data** - Route/stop data must be manually curated and imported (not auto-sourced)
4. **No schedule/frequency info** - Cannot tell users when the next bus arrives (uses 5-min average wait estimate)
5. **Internet required** - Map tiles and trip planning both require network connectivity
6. **Limited route coverage** - Only routes that have been manually added to the database
7. **No fare information** - Does not show ticket prices
8. **Walking segments use straight-line distance** - Not road-snapped walking directions (pedestrians walk flexibly, so this is a reasonable approximation)

**Visuals:**
- Limitation icons with brief descriptions
- Traffic light metaphor: Green (working), Yellow (partial), Red (not yet)

---

## Slide 18: Future Enhancements

**Content:**

### 1. Multi-Route Path Finder with Transfers
- Allow users to find routes that require 1-2 bus transfers instead of only direct routes
- The system will calculate the optimal transfer stop between routes
- Algorithm: Build a graph where stations are nodes and route segments are edges, then find shortest path allowing transfers

### 2. Real-Time Bus Location Visualization
- Display the live GPS location of buses moving along their route on the map interface
- Requires GPS hardware on buses and a real-time data pipeline (WebSocket or polling)

### 3. Service Disruption Notifications
- Notify users if a bus route is temporarily unavailable due to road closures, strikes, or traffic congestion
- Push notification system integrated with route status updates

### 4. Offline Route Map Download
- Allow users to download route maps and bus stop data so they can still search routes without internet access
- Pre-cache map tiles and route data to device storage

### 5. Additional Planned Features
- Fare estimation per route
- Bus schedule/frequency data integration
- Favorite routes and bookmarks
- Community-sourced route updates
- Multi-language expansion beyond English/Nepali
- Accessibility features (screen reader support, high contrast mode)

**Visuals:**
- Future roadmap timeline graphic
- Mockup wireframes for transfer routing and live tracking features

---

## Slide 19: Challenges Faced & How We Solved Them

**Content:**

| Challenge | Solution |
|---|---|
| **No existing transit data API for Nepal** | Manually curated bus stop coordinates and route stop sequences in JSON format |
| **MapTiler API rate limits / downtime** | Implemented circuit breaker pattern: after 3 failures, auto-switch to OSRM for 5 minutes |
| **Slow trip planning with many route combinations** | Pre-computed route edges + progressive nearest-stop expansion + shortlisting to cap API calls |
| **Map rendering in React Native** | Used WebView + MapLibre GL JS since no native MapTiler SDK exists for React Native |
| **Bidirectional routes (forward/reverse)** | Auto-generate route variants during import; platform selection based on direction (left/right side) |
| **Loop routes (circular bus lines)** | Special wrap-around traversal logic allowing origin_seq > destination_seq on loop routes |
| **Accurate road geometry** | Pre-compute and cache road-snapped GeoJSON from MapTiler/OSRM instead of straight lines |

**Visuals:**
- Before/after comparison: straight-line route vs road-snapped route on the map
- Circuit breaker diagram showing the failover flow

---

## Slide 20: Project Structure

**Content:**
```
pathyatra-react-native/
│
├── app/                          # Screens (file-based routing)
│   ├── (tabs)/
│   │   ├── index.tsx            # Home/Map screen
│   │   ├── routes.tsx           # Route browser
│   │   └── settings.tsx         # Settings
│   └── _layout.tsx              # Root layout + providers
│
├── backend/                      # Express API
│   ├── src/
│   │   ├── server.js            # API endpoints
│   │   ├── planner.js           # Trip planning algorithm
│   │   ├── transitRepository.js # Database queries
│   │   ├── maptiler.js          # MapTiler/OSRM integration
│   │   └── geo.js               # Haversine, GeoJSON utilities
│   ├── scripts/
│   │   ├── importTransit.js     # Import transit data
│   │   └── precomputeRouteEdges.js  # Pre-compute edges
│   └── sql/
│       ├── 001_schema.sql       # Database schema
│       └── 002_functions.sql    # PostGIS functions
│
├── components/                   # Reusable UI components
│   ├── CustomTabBar.tsx
│   ├── MapBackground.tsx
│   └── RouteMap.tsx
│
├── context/                      # React Context providers
│   ├── ThemeContext.tsx          # Dark/light mode
│   ├── LanguageContext.tsx       # English/Nepali i18n
│   └── MapStyleContext.tsx       # OSM/Satellite toggle
│
├── constants/                    # Theme colors, dimensions
├── hooks/                        # Custom React hooks
└── rough_data/                   # Raw transit data files
```

**Visuals:**
- Directory tree with color-coded folders (blue for frontend, green for backend, orange for shared)

---

## Slide 21: How to Run the Project

**Content:**

### Frontend
```bash
npm install
npx expo start
# Scan QR with Expo Go, or press 'a' for Android emulator
```

### Backend
```bash
cd backend
npm install
cp .env.example .env   # Configure Supabase + MapTiler keys
npm run import:transit  # Import bus data to Supabase
npm run precompute:edges  # Pre-compute route geometries
npm run dev             # Start API on port 4000
```

### Database Setup
1. Create a Supabase project (free tier)
2. Enable PostGIS extension
3. Run SQL migrations: `001_schema.sql` → `002_functions.sql`

**Visuals:**
- Terminal screenshots showing the setup flow
- Supabase dashboard screenshot showing tables

---

## Slide 22: Key Metrics & Numbers

**Content:**
- **React 19** + **React Native 0.81** (latest stable, New Architecture enabled)
- **Expo SDK 54** with React Compiler experiment
- **6 database tables** with spatial indexing
- **4 REST API endpoints** serving the mobile app
- **~1,200 lines** of trip planning algorithm (planner.js + geo.js)
- **40+ translated strings** in English and Nepali
- **3 React Context providers** (Theme, Language, MapStyle)
- **2 external routing engines** (MapTiler primary + OSRM fallback)
- **2.5km → 5km** progressive search radius for nearby stops
- **5-minute** wait penalty built into all trip scores
- **Circuit breaker**: 3 failures → 5-minute cooldown on MapTiler

**Visuals:**
- Infographic-style number highlights
- "By the numbers" layout with large bold numbers

---

## Slide 23: Conclusion & Thank You

**Content:**
- **Pathyatra** solves a real problem for Nepal's commuters
- Built with familiar, production-ready technologies (React ecosystem)
- Scalable architecture: Supabase → AWS migration path, OSRM fallback, pre-computed data
- Designed for the future: transfer routing, live tracking, offline mode
- **"Find your bus. Plan your journey. Arrive with confidence."**

**Visuals:**
- App logo centered
- Team photo (optional)
- QR code linking to the GitHub repo or live demo
- Contact information
- "Questions?" prompt

---

## Slide 24: Q&A

**Content:**
- "Questions & Discussion"
- Have the app running on a phone/emulator ready for live demo requests
- Prepare answers for common questions:
  - "How accurate is the routing?" → Pre-computed road-snapped edges + MapTiler directions
  - "Can this scale?" → Supabase → AWS, OSRM is self-hostable, all components are horizontally scalable
  - "Why not Google Maps API?" → Expensive for a student project, MapTiler free tier is more generous
  - "How do you handle new bus routes?" → Update transit.json, re-run import + precompute scripts
  - "Why WebView for maps?" → No native MapTiler/MapLibre SDK for React Native Expo; WebView gives full MapLibre GL JS capabilities

**Visuals:**
- Clean "Q&A" slide with team contact info
- App screenshots as subtle background

---

## Presentation Tips

1. **Duration estimate:** ~25-30 minutes for full presentation, ~15-20 if condensed
2. **Live demo:** Have the app running on Expo Go; demo the search → directions flow live
3. **Slides 9-10 (algorithm):** These are the most technical; spend extra time here, use the flowcharts
4. **Keep Slide 6 (tech stack) conversational:** Tell the story of WHY, not just WHAT
5. **Print the flowcharts large** if presenting on a projector - they're the highlight of the technical depth
6. **Prepare a backup video recording** of the app in case live demo has network issues
