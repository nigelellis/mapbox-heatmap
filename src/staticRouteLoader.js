// Static route loader that fetches pre-processed heatmap data
export const loadStaticHeatmapData = async () => {
  try {
    const response = await fetch('/heatmap-data.json');
    if (!response.ok) {
      throw new Error(`Failed to load heatmap data: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Loaded static heatmap data:', {
      totalRoutes: data.metadata.totalRoutes,
      totalFeatures: data.metadata.totalFeatures,
      generatedAt: data.metadata.generatedAt,
      format: data.metadata.format
    });
    
    // Convert compact format to GeoJSON features for map rendering
    if (data.metadata.format === 'compact') {
      const features = data.features.map((compactFeature, index) => {
        const [lon1, lat1, lon2, lat2, intensity] = compactFeature;
        
        return {
          type: 'Feature',
          id: index,
          properties: {
            intensity: intensity,
            density: intensity
          },
          geometry: {
            type: 'LineString',
            coordinates: [[lon1, lat1], [lon2, lat2]]
          }
        };
      });
      
      return {
        metadata: data.metadata,
        features: features
      };
    }
    
    // Legacy format - return as-is
    return data;
  } catch (error) {
    console.error('Error loading static heatmap data:', error);
    throw error;
  }
};