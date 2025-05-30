// Route loader utility for dynamically loading GPX files
import gpxParser from 'gpxparser';
import routeFiles from "../public/routes?dir2json&ext=.gpx&lazy";

export const loadRoutes = async () => {
  try {
    const routeFilesGPX = Object.keys(routeFiles).map(k => `${k}.gpx`);    
    const routePromises = routeFilesGPX.map(async (filename) => {
      const response = await fetch(`/routes/${filename}`);
      if (!response.ok) {
        console.warn(`Failed to load route: ${filename}`);
        return null;
      }
      const gpxText = await response.text();
      return parseGPX(gpxText, filename);
    });

    const routes = await Promise.all(routePromises);
    return routes.filter(route => route !== null);
  } catch (error) {
    console.error('Error loading routes:', error);
    return [];
  }
};

const parseGPX = (gpxText, filename) => {
  try {
    const gpx = new gpxParser();
    gpx.parse(gpxText);
    
    return {
      filename: filename,
      name: gpx.metadata?.name || filename.replace('.gpx', ''),
      description: gpx.metadata?.desc || '',
      tracks: gpx.tracks,
      waypoints: gpx.waypoints || []
    };
  } catch (error) {
    console.error(`Error parsing GPX file ${filename}:`, error);
    return null;
  }
};

export const convertRoutesToHeatmapData = (routes) => {
  const features = [];
  const segmentDensity = {}; // Track how many routes use each segment
  
  // First pass: collect all line segments and count density
  routes.forEach((route, routeIndex) => {
    if (route?.tracks) {
      route.tracks.forEach((track) => {
        for (let i = 0; i < track.points.length - 1; i++) {
          const point1 = track.points[i];
          const point2 = track.points[i + 1];
          
          // Create a key for this segment (order independent)
          const lat1 = Math.round(point1.lat * 10000) / 10000;
          const lon1 = Math.round(point1.lon * 10000) / 10000;
          const lat2 = Math.round(point2.lat * 10000) / 10000;
          const lon2 = Math.round(point2.lon * 10000) / 10000;
          
          const key = lat1 < lat2 || (lat1 === lat2 && lon1 < lon2) 
            ? `${lat1},${lon1}-${lat2},${lon2}`
            : `${lat2},${lon2}-${lat1},${lon1}`;
          
          segmentDensity[key] = (segmentDensity[key] || 0) + 1;
        }
      });
    }
  });
  
  // Second pass: create line features with density-based intensity
  routes.forEach((route, routeIndex) => {
    if (route?.tracks) {
      route.tracks.forEach((track, trackIndex) => {
        for (let i = 0; i < track.points.length - 1; i++) {
          const point1 = track.points[i];
          const point2 = track.points[i + 1];
          
          // Calculate density for this segment
          const lat1 = Math.round(point1.lat * 10000) / 10000;
          const lon1 = Math.round(point1.lon * 10000) / 10000;
          const lat2 = Math.round(point2.lat * 10000) / 10000;
          const lon2 = Math.round(point2.lon * 10000) / 10000;
          
          const key = lat1 < lat2 || (lat1 === lat2 && lon1 < lon2) 
            ? `${lat1},${lon1}-${lat2},${lon2}`
            : `${lat2},${lon2}-${lat1},${lon1}`;
          
          const density = segmentDensity[key] || 1;
          
          features.push({
            type: 'Feature',
            id: `${routeIndex}-${trackIndex}-${i}`, // Add unique ID for feature-state
            properties: {
              intensity: Math.min(density, 10), // Cap intensity at 10
              density: density,
              routeId: routeIndex,
              trackId: trackIndex,
              segmentId: i,
              routeName: route.name || `Route ${routeIndex}`,
              filename: route.filename
            },
            geometry: {
              type: 'LineString',
              coordinates: [[point1.lon, point1.lat], [point2.lon, point2.lat]]
            }
          });
        }
      });
    }
  });
  
  return features;
};
