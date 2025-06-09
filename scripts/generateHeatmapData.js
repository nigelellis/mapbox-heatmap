#!/usr/bin/env node

import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import gpxParser from 'gpxparser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesDir = path.join(__dirname, '../routes');
const outputFile = path.join(__dirname, '../public/heatmap-data.json');

// Function to parse a single GPX file asynchronously
async function parseGPXFile(filename, routesDir) {
  try {
    const gpxPath = path.join(routesDir, filename);
    const gpxText = await fsPromises.readFile(gpxPath, 'utf8');
    
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
}

// Function to process files in parallel with concurrency limit
async function processFilesInParallel(files, routesDir, concurrency = 10) {
  const results = [];
  let completed = 0;
  
  console.log(`Processing ${files.length} files with concurrency limit of ${concurrency}...`);
  
  // Create chunks of work based on concurrency limit
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    
    // Process chunk in parallel
    const chunkPromises = chunk.map(async (filename) => {
      const result = await parseGPXFile(filename, routesDir);
      completed++;
      
      if (completed % 10 === 0 || completed === files.length) {
        console.log(`Processed ${completed}/${files.length} GPX files`);
      }
      
      return result;
    });
    
    // Wait for chunk to complete before starting next chunk
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }
  
  return results.filter(result => result !== null);
}

// Optimized data structure - use arrays instead of objects for coordinates
function convertRoutesToCompactHeatmapData(routes) {
  const segmentDensity = new Map(); // Use Map for better performance
  const features = [];
  
  console.log('Converting routes to compact heatmap data...');
  
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
  console.log(`Processing ${totalSegments} segments...`);
  
  routes.forEach((route, routeIndex) => {
    if (route?.tracks) {
      route.tracks.forEach((track) => {
        for (let i = 0; i < track.points.length - 1; i++) {
          const point1 = track.points[i];
          const point2 = track.points[i + 1];
          
          // Reduce coordinate precision to save space (4 decimal places = ~10m precision)
          const lat1 = Math.round(point1.lat * 10000) / 10000;
          const lon1 = Math.round(point1.lon * 10000) / 10000;
          const lat2 = Math.round(point2.lat * 10000) / 10000;
          const lon2 = Math.round(point2.lon * 10000) / 10000;
          
          const key = lat1 < lat2 || (lat1 === lat2 && lon1 < lon2) 
            ? `${lat1},${lon1}-${lat2},${lon2}`
            : `${lat2},${lon2}-${lat1},${lon1}`;
          
          segmentDensity.set(key, (segmentDensity.get(key) || 0) + 1);
          
          processedSegments++;
          if (processedSegments % 5000 === 0) {
            console.log(`Analyzed ${processedSegments}/${totalSegments} segments`);
          }
        }
      });
    }
  });
  
  processedSegments = 0;
  console.log('Creating compact heatmap features...');
  
  // Second pass: create compact line features
  routes.forEach((route, routeIndex) => {
    if (route?.tracks) {
      route.tracks.forEach((track, trackIndex) => {
        for (let i = 0; i < track.points.length - 1; i++) {
          const point1 = track.points[i];
          const point2 = track.points[i + 1];
          
          // Calculate density for this segment with reduced precision
          const lat1 = Math.round(point1.lat * 10000) / 10000;
          const lon1 = Math.round(point1.lon * 10000) / 10000;
          const lat2 = Math.round(point2.lat * 10000) / 10000;
          const lon2 = Math.round(point2.lon * 10000) / 10000;
          
          const key = lat1 < lat2 || (lat1 === lat2 && lon1 < lon2) 
            ? `${lat1},${lon1}-${lat2},${lon2}`
            : `${lat2},${lon2}-${lat1},${lon1}`;
          
          const density = segmentDensity.get(key) || 1;
          
          // Ultra-compact feature format - single flat array
          features.push([
            lon1, lat1, lon2, lat2, // coordinates
            Math.min(density, 10) // intensity only (remove redundant IDs)
          ]);
          
          processedSegments++;
          if (processedSegments % 5000 === 0) {
            console.log(`Created ${processedSegments}/${totalSegments} features`);
          }
        }
      });
    }
  });
  
  console.log(`Generated ${features.length} compact heatmap features`);
  return features;
}

// Stream large JSON to file to avoid memory issues
function writeCompactJSON(outputPath, metadata, features) {
  console.log('Writing compact JSON file...');
  
  const writeStream = fs.createWriteStream(outputPath);
  
  // Write header
  writeStream.write('{\n');
  writeStream.write(`  "metadata": ${JSON.stringify(metadata, null, 2)},\n`);
  writeStream.write('  "format": {\n');
  writeStream.write('    "description": "Ultra-compact format: [lon1, lat1, lon2, lat2, intensity]",\n');
  writeStream.write('    "structure": "Each feature is [longitude1, latitude1, longitude2, latitude2, intensity]"\n');
  writeStream.write('  },\n');
  writeStream.write('  "features": [\n');
  
  // Write features in chunks
  const chunkSize = 1000;
  for (let i = 0; i < features.length; i += chunkSize) {
    const chunk = features.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= features.length;
    
    chunk.forEach((feature, index) => {
      const isLastInChunk = index === chunk.length - 1;
      const isLastOverall = isLast && isLastInChunk;
      
      writeStream.write(`    ${JSON.stringify(feature)}${isLastOverall ? '' : ','}\n`);
    });
    
    if (i % 10000 === 0) {
      console.log(`Written ${Math.min(i + chunkSize, features.length)}/${features.length} features`);
    }
  }
  
  writeStream.write('  ]\n');
  writeStream.write('}\n');
  writeStream.end();
  
  console.log('Compact JSON file written successfully');
}

// Main function
async function generateHeatmapData() {
  try {
    console.log('Starting GPX processing...');
    
    // Read all GPX files from routes directory
    const files = fs.readdirSync(routesDir).filter(file => file.endsWith('.gpx'));

    console.log(`Found ${files.length} GPX files`);
    
    // Process files in parallel with timing
    const startTime = Date.now();
    const routes = await processFilesInParallel(files, routesDir, 40); // Increase concurrency for better performance
    const loadTime = Date.now() - startTime;
    
    console.log(`Successfully parsed ${routes.length} routes in ${(loadTime / 1000).toFixed(2)}s`);
    
    // Convert to compact heatmap data with timing
    const conversionStartTime = Date.now();
    const compactFeatures = convertRoutesToCompactHeatmapData(routes);
    const conversionTime = Date.now() - conversionStartTime;
    
    // Create metadata
    const metadata = {
      generatedAt: new Date().toISOString(),
      totalRoutes: routes.length,
      totalFeatures: compactFeatures.length,
      routeNames: routes.map(r => r.name),
      format: 'compact',
      coordinatePrecision: 4
    };
    
    // Write compact JSON using streaming with timing
    const writeStartTime = Date.now();
    writeCompactJSON(outputFile, metadata, compactFeatures);
    const writeTime = Date.now() - writeStartTime;
    
    const totalTime = Date.now() - startTime;
    
    console.log(`Generated compact heatmap data saved to ${outputFile}`);
    console.log(`\nPerformance Summary:`);
    console.log(`- File loading: ${(loadTime / 1000).toFixed(2)}s`);
    console.log(`- Data conversion: ${(conversionTime / 1000).toFixed(2)}s`);
    console.log(`- File writing: ${(writeTime / 1000).toFixed(2)}s`);
    console.log(`- Total time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`\nData Summary:`);
    console.log(`- Total routes: ${routes.length}`);
    console.log(`- Total features: ${compactFeatures.length}`);
    
    // Calculate file size
    const stats = fs.statSync(outputFile);
    console.log(`- File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
  } catch (error) {
    console.error('Error generating heatmap data:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateHeatmapData();
}

export { generateHeatmapData };
