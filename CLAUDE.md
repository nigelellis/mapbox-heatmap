# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production (automatically runs generate-heatmap first)
- `npm run generate-heatmap` - Pre-process GPX files into static JSON heatmap data
- `npm run lint` - Run ESLint on JS/JSX files
- `npm run preview` - Preview production build locally

## Environment Setup

Copy `template.env` to `.env` and add your Mapbox access token:
```
VITE_MAPBOX_TOKEN=your_mapbox_token_here
```

## Application Architecture

This is a React + Vite application that creates an interactive heatmap visualization of TGO (The Great Outdoors) Challenge hiking routes using Mapbox GL JS.

### Core Components

- **App.jsx** - Main application component containing:
  - Mapbox GL map initialization and management
  - GPX route data processing and heatmap generation
  - Color scheme and intensity controls
  - Overlap radius configuration for route density calculations

- **routeLoader.js** - Handles:
  - Dynamic loading of GPX files from `/public/routes/`
  - GPX parsing using gpxparser library
  - Route density calculation and segment overlap detection
  - Conversion to GeoJSON features for map rendering

### Data Processing Flow

1. **Build-time Processing**: GPX files are processed at build time using `scripts/generateHeatmapData.js` to create `/public/heatmap-data.json`
2. **Static Data Loading**: The application loads pre-processed heatmap data from the static JSON file at startup
3. **Runtime Processing**: Only overlap radius and randomization settings are processed at runtime for performance
4. **Map Rendering**: Data is rendered as Mapbox GL line layers with color/width based on intensity

### Build Process

The application uses a two-stage build process:
1. **Pre-build**: `npm run generate-heatmap` processes all GPX files in `/public/routes/` and generates static heatmap data
2. **Main build**: Standard Vite build process that includes the pre-generated JSON file

The static JSON file is automatically regenerated when:
- Running `npm run build` (via prebuild script)
- Manually running `npm run generate-heatmap`
- Any GPX files in `/public/routes/` are added, modified, or removed (manual regeneration required)

### Key Features

- **Color Schemes**: Toggle between blue gradient (default) and full spectrum heatmap colors
- **Overlap Radius**: Configurable precision for determining when routes are considered overlapping (1m to 10km)
- **Randomization**: Optional feature to simulate route usage patterns with realistic intersection-based segments
- **Real-time Processing**: Live updates when changing overlap radius or randomization settings

### GPX Data

Routes are stored in `/public/routes/` as GPX files. The application expects standard GPX format with track points containing latitude/longitude coordinates. All route files are automatically discovered and loaded.

### Map Configuration

- Uses Mapbox GL with dark theme (`mapbox://styles/mapbox/dark-v11`)
- Auto-fits bounds to display all loaded routes
- Zoom-responsive line width and opacity
- Navigation controls included

## Technical Notes

- Uses `vite-plugin-dir2json` to dynamically discover GPX files
- Precision calculations use `Math.round(coord * precision)` pattern for overlap detection
- Processing states prevent UI interaction during calculations
- Route segments are uniquely identified by coordinate pairs and route IDs