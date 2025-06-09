// Route loader utility for dynamically loading GPX files
import gpxParser from 'gpxparser';
import routeFiles from "../public/routes?dir2json&ext=.gpx&lazy";

export const loadRoutes = async (onProgress) => {
  try {
    const routeFilesGPX = Object.keys(routeFiles).map(k => `${k}.gpx`);

    const totalFiles = routeFilesGPX.length;
    let completedFiles = 0;
    
    const routePromises = routeFilesGPX.map(async (filename) => {
      const response = await fetch(`/routes/${filename}`);
      if (!response.ok) {
        console.warn(`Failed to load route: ${filename}`);
        completedFiles++;
        if (onProgress) {
          onProgress(completedFiles, totalFiles, `Loading ${filename}`);
        }
        return null;
      }
      const gpxText = await response.text();
      const result = parseGPX(gpxText, filename);
      
      completedFiles++;
      if (onProgress) {
        onProgress(completedFiles, totalFiles, `Loaded ${filename}`);
      }
      
      return result;
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

export const convertRoutesToHeatmapData = (routes, onProgress) => {
  const features = [];
  const segmentDensity = {}; // Track how many routes use each segment
  
  // Count total segments for progress tracking
  let totalSegments = 0;
  routes.forEach((route) => {
    if (route?.tracks) {
      route.tracks.forEach((track) => {
        totalSegments += Math.max(0, track.points.length - 1);
      });
    }
  });
  
  let processedSegments = 0;
  
  // First pass: collect all line segments and count density
  if (onProgress) onProgress(0, totalSegments, 'Analyzing route segments...');
  
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
          
          processedSegments++;
          if (onProgress && processedSegments % 100 === 0) {
            onProgress(processedSegments, totalSegments, 'Analyzing route segments...');
          }
        }
      });
    }
  });
  
  processedSegments = 0;
  if (onProgress) onProgress(0, totalSegments, 'Creating heatmap features...');
  
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
          
          processedSegments++;
          if (onProgress && processedSegments % 100 === 0) {
            onProgress(processedSegments, totalSegments, 'Creating heatmap features...');
          }
        }
      });
    }
  });
  
  if (onProgress) onProgress(totalSegments, totalSegments, 'Heatmap calculation complete');
  
  return features;
};
