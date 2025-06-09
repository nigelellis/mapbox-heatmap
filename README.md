# Mapbox Hiking Routes Heatmap

A React application that displays hiking routes as a heatmap overlay on OpenHikingMap using Mapbox GL JS.


![image](https://github.com/user-attachments/assets/78626f08-5296-4424-96b2-41c2023b9dce)

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
