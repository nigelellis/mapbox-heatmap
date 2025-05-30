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

  useEffect(() => {
    const initializeMap = async () => {
      // if (map.current) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [lng, lat],
        zoom: zoom
      });

      // Add zoom controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Update zoom level state when map zoom changes
      map.current.on('zoom', () => {
        setZoomLevel(map.current.getZoom());
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
            // Color based on segment density/intensity (Strava blue gradient)
            'line-color': [
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
            ],
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

    return () => map.current?.remove();
  }, []);


  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '10px',
        borderRadius: '5px',
        fontFamily: 'Arial, sans-serif'
      }}>
        <h3 style={{ margin: 0, marginBottom: '5px' }}>Route Heatmap</h3>
        <p style={{ margin: 0, fontSize: '12px' }}>
          {loading ? 'Loading routes...' : `Displaying ${routes.length} UK hiking routes`}
        </p>
        <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>
          Heatmap lines showing route segment density and popularity
        </p>
      </div>
      
      {/* Zoom level display */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        background: 'rgba(255, 255, 255, 0.8)',
        padding: '4px 8px',
        borderRadius: '4px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '12px',
        color: '#333'
      }}>
        Zoom: {zoomLevel.toFixed(1)}
      </div>
    </div>
  );
}

export default App;
