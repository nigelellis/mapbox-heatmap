import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { loadRoutes, convertRoutesToHeatmapData } from './routeLoader';

// You'll need to get a Mapbox access token from https://account.mapbox.com/
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng] = useState(-2.5);
  const [lat] = useState(54.5);
  const [zoom] = useState(6);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(6);
  const [showZoomLevel, setShowZoomLevel] = useState(false);
  const zoomTimeoutRef = useRef(null);
  const [colorScheme, setColorScheme] = useState('blue'); // 'blue' or 'full'
  const [randomizeIntensity, setRandomizeIntensity] = useState(false);
  const [originalHeatmapData, setOriginalHeatmapData] = useState([]);
  const [processedHeatmapData, setProcessedHeatmapData] = useState([]);
  const [overlapRadius, setOverlapRadius] = useState(10000); // Precision multiplier for overlap detection
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Function to capture high-resolution screenshot
  const captureScreenshot = () => {
    if (!map.current) return;
    
    setIsCapturing(true);
    
    // Hide UI overlays temporarily and wait for them to disappear
    setTimeout(() => {
      // Use Mapbox's built-in canvas method which properly handles WebGL
      const canvas = map.current.getCanvas();
      
      // For high resolution, we'll use the existing canvas and scale it up
      // Mapbox GL canvas is already rendered at device pixel ratio
      try {
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tgo-heatmap-${new Date().toISOString().slice(0, 10)}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } else {
            console.error('Failed to create blob from canvas');
          }
          setIsCapturing(false);
        }, 'image/png', 1.0);
      } catch (error) {
        console.error('Error capturing screenshot:', error);
        setIsCapturing(false);
      }
    }, 200); // Longer delay to ensure UI is hidden
  };

  // Function to reprocess original data with configurable radius
  const reprocessWithRadius = (data, precision) => {
    const segmentDensity = {}; // Track how many routes use each segment
    
    // First pass: collect all line segments and count density with configurable precision
    data.forEach(feature => {
      const coords = feature.geometry.coordinates;
      const lat1 = Math.round(coords[0][1] * precision) / precision;
      const lon1 = Math.round(coords[0][0] * precision) / precision;
      const lat2 = Math.round(coords[1][1] * precision) / precision;
      const lon2 = Math.round(coords[1][0] * precision) / precision;
      
      const key = lat1 < lat2 || (lat1 === lat2 && lon1 < lon2) 
        ? `${lat1},${lon1}-${lat2},${lon2}`
        : `${lat2},${lon2}-${lat1},${lon1}`;
      
      segmentDensity[key] = (segmentDensity[key] || 0) + 1;
    });
    
    // Second pass: update intensity based on new density calculation
    return data.map(feature => {
      const coords = feature.geometry.coordinates;
      const lat1 = Math.round(coords[0][1] * precision) / precision;
      const lon1 = Math.round(coords[0][0] * precision) / precision;
      const lat2 = Math.round(coords[1][1] * precision) / precision;
      const lon2 = Math.round(coords[1][0] * precision) / precision;
      
      const key = lat1 < lat2 || (lat1 === lat2 && lon1 < lon2) 
        ? `${lat1},${lon1}-${lat2},${lon2}`
        : `${lat2},${lon2}-${lat1},${lon1}`;
      
      const density = segmentDensity[key] || 1;
      
      return {
        ...feature,
        properties: {
          ...feature.properties,
          intensity: Math.min(density, 10), // Cap intensity at 10
          density: density
        }
      };
    });
  };

  // Function to create realistic intensity patterns based on route intersections
  const randomizeIntensities = (data, precision = overlapRadius) => {
    // Group features by route for processing
    const routeGroups = {};
    data.forEach(feature => {
      const routeId = feature.properties.routeId;
      if (!routeGroups[routeId]) {
        routeGroups[routeId] = [];
      }
      routeGroups[routeId].push(feature);
    });
    
    // Find intersection points (where routes share the same geographic coordinates)
    const pointToRoutes = {}; // Maps coordinate strings to route IDs that use them
    
    data.forEach(feature => {
      const coords = feature.geometry.coordinates;
      [coords[0], coords[1]].forEach(coord => {
        const key = `${Math.round(coord[1] * precision)},${Math.round(coord[0] * precision)}`;
        if (!pointToRoutes[key]) {
          pointToRoutes[key] = new Set();
        }
        pointToRoutes[key].add(feature.properties.routeId);
      });
    });
    
    // Find actual intersection points (used by multiple routes)
    const intersectionPoints = new Set();
    Object.keys(pointToRoutes).forEach(pointKey => {
      if (pointToRoutes[pointKey].size > 1) {
        intersectionPoints.add(pointKey);
      }
    });
    
    // For each route, identify segments between intersection points
    const routeSegments = {};
    Object.keys(routeGroups).forEach(routeId => {
      const route = routeGroups[routeId];
      routeSegments[routeId] = [];
      
      let currentSegment = [];
      route.forEach((feature, index) => {
        currentSegment.push(feature);
        
        // Check if this feature ends at an intersection point
        const coords = feature.geometry.coordinates;
        const endPointKey = `${Math.round(coords[1][1] * precision)},${Math.round(coords[1][0] * precision)}`;
        
        if (intersectionPoints.has(endPointKey) || index === route.length - 1) {
          // End current segment and start new one
          if (currentSegment.length > 0) {
            routeSegments[routeId].push([...currentSegment]);
            currentSegment = [];
          }
        }
      });
    });
    
    // Assign intensity to each segment based on how many routes use overlapping areas
    const segmentIntensities = {};
    
    Object.keys(routeSegments).forEach(routeId => {
      routeSegments[routeId].forEach((segment, segmentIndex) => {
        const segmentKey = `${routeId}-${segmentIndex}`;
        
        // Check how many other routes overlap with this segment's area
        let overlapCount = 1; // Start with 1 for this route
        
        segment.forEach(feature => {
          const coords = feature.geometry.coordinates;
          [coords[0], coords[1]].forEach(coord => {
            const pointKey = `${Math.round(coord[1] * precision)},${Math.round(coord[0] * precision)}`;
            if (pointToRoutes[pointKey]) {
              overlapCount = Math.max(overlapCount, pointToRoutes[pointKey].size);
            }
          });
        });
        
        // Add some randomness while respecting overlap patterns
        const baseIntensity = Math.min(overlapCount, 10);
        const randomVariation = Math.random() * 0.4 - 0.2; // ±20% variation
        const intensity = Math.max(1, Math.min(10, Math.round(baseIntensity + randomVariation)));
        
        segmentIntensities[segmentKey] = intensity;
      });
    });
    
    // Apply intensities to features
    return data.map(feature => {
      const routeId = feature.properties.routeId;
      const segments = routeSegments[routeId] || [];
      
      // Find which segment this feature belongs to
      let segmentIndex = 0;
      let found = false;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].some(f => f.id === feature.id)) {
          segmentIndex = i;
          found = true;
          break;
        }
      }
      
      const segmentKey = `${routeId}-${segmentIndex}`;
      const intensity = segmentIntensities[segmentKey] || 1;
      
      return {
        ...feature,
        properties: {
          ...feature.properties,
          intensity: intensity
        }
      };
    });
  };

  // Color scheme definitions
  const getColorScheme = (scheme) => {
    if (scheme === 'full') {
      // Full spectrum heatmap colors (cool to warm)
      return [
        'interpolate',
        ['linear'],
        ['get', 'intensity'],
        1, 'rgba(0, 120, 255, 0.4)',
        2, 'rgba(0, 140, 255, 0.5)',
        1, 'rgba(0, 0, 255, 0.4)',     // Blue (low intensity)
        2, 'rgba(0, 100, 255, 0.5)',   // Light blue
        3, 'rgba(0, 200, 255, 0.6)',   // Cyan
        4, 'rgba(0, 255, 200, 0.7)',   // Light cyan
        5, 'rgba(0, 255, 100, 0.8)',   // Green
        6, 'rgba(100, 255, 0, 0.9)',   // Yellow-green
        7, 'rgba(200, 255, 0, 1.0)',   // Yellow
        8, 'rgba(255, 200, 0, 1.0)',   // Orange
        9, 'rgba(255, 100, 0, 1.0)',   // Red-orange
        10, 'rgba(255, 0, 0, 1.0)'     // Red (high intensity)
      ];
    } else {
      // Current blue gradient scheme
      return [
        'interpolate',
        ['linear'],
        ['get', 'intensity'],
        1, 'rgba(0, 120, 255, 0.4)',
        2, 'rgba(0, 140, 255, 0.5)',
        3, 'rgba(0, 160, 255, 0.6)',
        4, 'rgba(0, 180, 255, 0.7)',
        5, 'rgba(0, 200, 255, 0.8)',
        6, 'rgba(30, 144, 255, 0.9)',
        7, 'rgba(0, 100, 255, 1.0)',
        8, 'rgba(0, 80, 255, 1.0)',
        9, 'rgba(0, 60, 220, 1.0)',
        10, 'rgba(0, 40, 180, 1.0)'
      ];
    }
  };

  useEffect(() => {
    const initializeMap = async () => {
      // if (map.current) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [lng, lat],
        zoom: zoom,
        preserveDrawingBuffer: true // Required for screenshot functionality
      });

      // Add zoom controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Update zoom level state when map zoom changes
      map.current.on('zoom', () => {
        setZoomLevel(map.current.getZoom());
        setShowZoomLevel(true);
        
        // Clear existing timeout
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        
        // Hide zoom level after 1.5 seconds of no zoom activity
        zoomTimeoutRef.current = setTimeout(() => {
          setShowZoomLevel(false);
        }, 1500);
      });

      map.current.on('load', async () => {
        // Load GPX routes
        const loadedRoutes = await loadRoutes();
        setRoutes(loadedRoutes);
        setLoading(false);

        // Parse GPX data into line segments with density calculation
        const heatmapData = convertRoutesToHeatmapData(loadedRoutes);
        console.log('Loaded routes:', loadedRoutes.length);
        console.log('Heatmap features:', heatmapData.length);
        
        // Store original data for processing
        setOriginalHeatmapData(heatmapData);
        // Initial processing with default radius
        setProcessedHeatmapData(heatmapData);
        
        // Add heatmap line data source
        map.current.addSource('hiking-routes', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: heatmapData
          }
        });

        // Add Strava-style heatmap lines with intensity-based coloring
        map.current.addLayer({
          id: 'hiking-heatmap-lines',
          type: 'line',
          source: 'hiking-routes',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            // Color based on segment density/intensity
            'line-color': getColorScheme(colorScheme),
            // Line width increases with density and zoom
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6, [
                'interpolate',
                ['linear'],
                ['get', 'intensity'],
                1, 1,
                10, 3
              ],
              12, [
                'interpolate',
                ['linear'],
                ['get', 'intensity'],
                1, 2,
                10, 6
              ],
              18, [
                'interpolate',
                ['linear'],
                ['get', 'intensity'],
                1, 3,
                10, 8
              ]
            ],
            // Opacity based on intensity
            'line-opacity': [
              'interpolate',
              ['linear'],
              ['get', 'intensity'],
              1, 0.6,
              5, 0.8,
              10, 1.0
            ]
          }
        });


        // Auto-zoom to fit all routes
        if (heatmapData.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          let pointCount = 0;
          
          heatmapData.forEach((feature, index) => {
            if (feature.geometry && feature.geometry.coordinates) {
              // Each feature is a LineString with coordinates [[lng1, lat1], [lng2, lat2]]
              feature.geometry.coordinates.forEach(coord => {
                if (coord && coord.length >= 2) {
                  bounds.extend([coord[0], coord[1]]); // [longitude, latitude]
                  pointCount++;
                }
              });
            }
          });

          console.log(`Extended bounds with ${pointCount} points`);
          console.log('Final bounds:', bounds.toArray());
          
          if (pointCount > 0) {
            // Calculate center of bounds
            const center = bounds.getCenter();
            console.log('Calculated center:', center);
            
            // Move map to center and then fit bounds
            map.current.setCenter([center.lng, center.lat]);
            
            map.current.fitBounds(bounds, {
              padding: 50,
              maxZoom: 12
            });
          }
        }
      });
    };

    initializeMap();

    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
      map.current?.remove();
    };
  }, []);

  // Update color scheme when changed
  useEffect(() => {
    if (map.current && map.current.getLayer('hiking-heatmap-lines')) {
      map.current.setPaintProperty('hiking-heatmap-lines', 'line-color', getColorScheme(colorScheme));
    }
  }, [colorScheme]);

  // Update processed data when overlap radius changes, then update map
  useEffect(() => {
    if (originalHeatmapData.length > 0) {
      console.log('Starting processing...');
      setIsProcessing(true);
      
      // Use setTimeout to allow UI to update with processing state
      setTimeout(() => {
        console.log('Processing data with radius:', overlapRadius);
        const newProcessedData = reprocessWithRadius(originalHeatmapData, overlapRadius);
        setProcessedHeatmapData(newProcessedData);
        
        // Now update the map with the appropriate data
        if (map.current && map.current.getSource('hiking-routes')) {
          let dataToUse;
          if (randomizeIntensity) {
            console.log('Applying randomization...');
            dataToUse = randomizeIntensities(newProcessedData, overlapRadius);
          } else {
            dataToUse = newProcessedData;
          }
          
          map.current.getSource('hiking-routes').setData({
            type: 'FeatureCollection',
            features: dataToUse
          });
        }
        
        console.log('Processing complete');
        setIsProcessing(false);
      }, 500); // Increased to 500ms to make processing indicator clearly visible
    }
  }, [originalHeatmapData, overlapRadius, randomizeIntensity]);


  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {!isCapturing && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '8px',
          borderRadius: '4px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '11px',
          maxWidth: '200px'
        }}>
        <h3 style={{ margin: 0, marginBottom: '4px', fontSize: '13px' }}>TGO Heatmap</h3>
        <p style={{ margin: 0, fontSize: '10px', marginBottom: '6px' }}>
          {loading ? 'Loading...' : 
           isProcessing ? 'Processing...' : 
           `${routes.length} routes`}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div>
            <label style={{ fontSize: '9px', display: 'block', marginBottom: '1px', color: '#666' }}>
              Palette:
            </label>
            <select 
              value={colorScheme} 
              onChange={(e) => setColorScheme(e.target.value)}
              disabled={isProcessing}
              style={{
                fontSize: '9px',
                padding: '1px 2px',
                border: '1px solid #ccc',
                borderRadius: '2px',
                backgroundColor: isProcessing ? '#f5f5f5' : 'white',
                opacity: isProcessing ? 0.6 : 1,
                width: '100%'
              }}
            >
              <option value="blue">Blue</option>
              <option value="full">Spectrum</option>
            </select>
          </div>
          
          <div>
            <label style={{ fontSize: '9px', display: 'block', marginBottom: '1px', color: '#666' }}>
              Precision:
            </label>
            <select 
              value={overlapRadius} 
              onChange={(e) => setOverlapRadius(parseInt(e.target.value))}
              disabled={isProcessing}
              style={{
                fontSize: '9px',
                padding: '1px 2px',
                border: '1px solid #ccc',
                borderRadius: '2px',
                backgroundColor: isProcessing ? '#f5f5f5' : 'white',
                opacity: isProcessing ? 0.6 : 1,
                width: '100%'
              }}
            >
              <option value={100000}>1m</option>
              <option value={10000}>10m</option>
              <option value={1000}>100m</option>
              <option value={500}>500m</option>
              <option value={100}>1km</option>
            </select>
          </div>
          
          <label style={{ fontSize: '9px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={randomizeIntensity}
              onChange={(e) => setRandomizeIntensity(e.target.checked)}
              disabled={isProcessing}
              style={{ 
                marginRight: '3px',
                opacity: isProcessing ? 0.6 : 1,
                transform: 'scale(0.8)'
              }}
            />
            Randomize
          </label>
          
          <button 
            onClick={captureScreenshot}
            disabled={isProcessing || isCapturing}
            style={{
              fontSize: '8px',
              padding: '3px 4px',
              border: '1px solid #ccc',
              borderRadius: '2px',
              backgroundColor: isProcessing || isCapturing ? '#f5f5f5' : '#fff',
              cursor: isProcessing || isCapturing ? 'default' : 'pointer',
              opacity: isProcessing || isCapturing ? 0.6 : 1,
              marginTop: '1px'
            }}
          >
            {isCapturing ? 'Capturing...' : '📷 Screenshot'}
          </button>
        </div>
        </div>
      )}
      
      {/* Zoom level display - only show during zoom changes */}
      {!isCapturing && showZoomLevel && (
        <div style={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          color: '#333',
          transition: 'opacity 0.3s ease-in-out'
        }}>
          Zoom: {zoomLevel.toFixed(1)}
        </div>
      )}
    </div>
  );
}

export default App;
