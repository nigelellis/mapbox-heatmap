# Mapbox Hiking Routes Heatmap

A React application that displays hiking routes as a heatmap overlay on OpenHikingMap using Mapbox GL JS.

## Features

- **OpenHikingMap Integration**: Uses the OpenHikingMap tile layer for detailed hiking trail information
- **Route Heatmap**: Visualizes ~50 sample hiking routes from Oregon as a density heatmap
- **Interactive Map**: Zoom-dependent layer switching between heatmap and individual points
- **Sample Data**: Includes 50 hiking routes with realistic GPS coordinates from Oregon trails

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Get a Mapbox Access Token**:
   - Sign up at [Mapbox](https://account.mapbox.com/)
   - Get your access token
   - Copy `template.env` to `.env` and replace the `VITE_MAPBOX_TOKEN` with your token

3. **Run the development server**:
   ```bash
   npm run dev
   ```

## Production Publish
The `main` branch auto pushes to https://tgoheatmap.netlify.app/
