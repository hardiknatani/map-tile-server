
    var aws = require('aws-sdk');
    const fs = require('fs');
    const path = require('path');
    const env = require('./environment');
    const NORWAY_COG_DEM = require('./NORWAY_COG_DEM.json');

    const d2r = Math.PI / 180;

    let mosaicJsonBase={
        "mosaicjson": "0.0.2",
      
        "name": "compositing",
      
        "description": "A simple, light grey world.",
      
        "version": "1.0.0",
      
        "attribution": "<a href='http://openstreetmap.org'>OSM contributors</a>",
      
        "minzoom": 10,
      
        "maxzoom": 16,
      
        "quadkey_zoom": 10,
      
        "bounds": [  ],
      
        "center": [ ],
      
        "tiles": {
      
        }
      }

     function getMosaicJsonUrl(lat,lng,radius){
          // calculate buffer area from lat,lng,radius
      let  projectAreaGeojson={
            "type": "FeatureCollection",
            "features": [
              generateBufferCircle(lat,lng,radius)
            ]
          }

          //for debugging
          // fs.writeFileSync('circle.geojson',JSON.stringify(projectAreaGeojson))
                
            let minZoom = 10;
            // get Tiles overlapping with the buffer geometry
            let tiles = getTiles(projectAreaGeojson.features[0].geometry,{min_zoom: minZoom,  max_zoom: minZoom});
            // Get respective quadkeys of tiles
            let quadkeys = tiles.map(tile=>tileToQuadkey(tile));
            //calculate bounds
            let bounds = calculateBoundingBox(projectAreaGeojson.features[0].geometry);

            //Update data in empty mosaicJson
            mosaicJsonBase.name=`project_area_${Math.floor(Math.random()*1000000)}`;
            mosaicJsonBase.bounds=bounds;
            mosaicJsonBase.center= [(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2,minZoom];
        
            // find quadkeys present in the JSON
            Object.keys(NORWAY_COG_DEM.tiles).forEach(key=>{
              if(quadkeys.includes(key)){
                mosaicJsonBase.tiles[key]=NORWAY_COG_DEM.tiles[key]
              }
            })

            //create and upload file on s3
            let fileName=mosaicJsonBase["name"]+'.json';
            let fileContent;
            fs.writeFileSync(fileName, JSON.stringify(mosaicJsonBase));
            fileContent = fs.readFileSync(fileName);
            return  putFileObject('houston/test/',fileContent,mosaicJsonBase.name+'.json')
         
          
     }

     function getS3Bucket() {
        const bucket = new aws.S3(
          {
            accessKeyId: env.s3Config_7a.accessKeyID,
            secretAccessKey: env.s3Config_7a.secretAccessKey,
            region: env.s3Config_7a.region
          }
        );
      
        return bucket;
      }
      function putFileObject(folder, file,fileName) {
      
        const params = {
          Bucket: env.s3Config_7a.bucket,
          Key: folder + fileName,
          Body: file
        };
      
        var options = {
          partSize: 10 * 1024 * 1024,
          queueSize: 1,
        };
      
          let upload = getS3Bucket().upload(params, options);
      
        return new Promise((resolve, reject) => {
          upload.send(function (err, data) {
            if (err) {
              reject(false);
              console.log(err)
              
            }else{
              resolve(data);
              console.log(data)
            }
          });
        });
      }

     function  tileToQuadkey(tile) {
        var index = '';
        for (var z = tile[2]; z > 0; z--) {
            var b = 0;
            var mask = 1 << (z - 1);
            if ((tile[0] & mask) !== 0) b++;
            if ((tile[1] & mask) !== 0) b += 2;
            index += b.toString();
        }
        return index;
    }
    function  pointToTileFraction(lon, lat, z) {
        var sin = Math.sin(lat * d2r),
            z2 = Math.pow(2, z),
            x = z2 * (lon / 360 + 0.5),
            y = z2 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    
        // Wrap Tile X
        x = x % z2;
        if (x < 0) x = x + z2;
        return [x, y, z];
    }

    function  pointToTile(lon, lat, z) {
        var tile = pointToTileFraction(lon, lat, z);
        tile[0] = Math.floor(tile[0]);
        tile[1] = Math.floor(tile[1]);
        return tile;
    }


    function getTiles(geom, limits) {
      var i, tile,
          coords = geom.coordinates,
          maxZoom = limits.max_zoom,
          tileHash = {},
          tiles = [];
  
      if (geom.type === 'Point') {
          return [tilebelt.pointToTile(coords[0], coords[1], maxZoom)];
  
      } else if (geom.type === 'MultiPoint') {
          for (i = 0; i < coords.length; i++) {
              tile = tilebelt.pointToTile(coords[i][0], coords[i][1], maxZoom);
              tileHash[toID(tile[0], tile[1], tile[2])] = true;
          }
      } else if (geom.type === 'LineString') {
          lineCover(tileHash, coords, maxZoom);
  
      } else if (geom.type === 'MultiLineString') {
          for (i = 0; i < coords.length; i++) {
              lineCover(tileHash, coords[i], maxZoom);
          }
      } else if (geom.type === 'Polygon') {
          polygonCover(tileHash, tiles, coords, maxZoom);
  
      } else if (geom.type === 'MultiPolygon') {
          for (i = 0; i < coords.length; i++) {
              polygonCover(tileHash, tiles, coords[i], maxZoom);
          }
      } else {
          throw new Error('Geometry type not implemented');
      }
  
      if (limits.min_zoom !== maxZoom) {
          // sync tile hash and tile array so that both contain the same tiles
          var len = tiles.length;
          appendHashTiles(tileHash, tiles);
          for (i = 0; i < len; i++) {
              var t = tiles[i];
              tileHash[toID(t[0], t[1], t[2])] = true;
          }
          return mergeTiles(tileHash, tiles, limits);
      }
  
      appendHashTiles(tileHash, tiles);
      return tiles;
  }
  

    function  generateBufferCircle(latitude, longitude, radiusInMeters) {
  const earthRadius = 6371000; // Radius of the Earth in meters

  // Convert the radius from meters to radians
  const radiusInRadians = radiusInMeters / earthRadius;

  // Convert latitude and longitude to radians
  const latInRadians = latitude * (Math.PI / 180);
  const lonInRadians = longitude * (Math.PI / 180);

  const bufferPoints = [];

  // Generate points along the circumference of the circle
  for (let i = 0; i <= 360; i++) {
    const angleInRadians = i * (Math.PI / 180);

    const lat = Math.asin(
      Math.sin(latInRadians) * Math.cos(radiusInRadians) +
        Math.cos(latInRadians) * Math.sin(radiusInRadians) * Math.cos(angleInRadians)
    );

    const lon =
      lonInRadians +
      Math.atan2(
        Math.sin(angleInRadians) * Math.sin(radiusInRadians) * Math.cos(latInRadians),
        Math.cos(radiusInRadians) - Math.sin(latInRadians) * Math.sin(lat)
      );

    // Convert the lat and lon back to degrees
    const latInDegrees = lat * (180 / Math.PI);
    const lonInDegrees = lon * (180 / Math.PI);

    bufferPoints.push([lonInDegrees, latInDegrees]);
  }

  // Create GeoJSON object
  const geoJson = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [bufferPoints],
    },
    properties: {},
  };

  return geoJson;
}
function  calculateBoundingBox(geometry) {
        // Initialize variables with extreme values
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
      
        // Helper function to update the bounding box coordinates
        function updateBoundingBoxCoordinates(x, y) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      
        // Recursive function to iterate over geometry coordinates
        function processCoordinates(coordinates) {
          if (Array.isArray(coordinates)) {
            if (Array.isArray(coordinates[0])) {
              for (let i = 0; i < coordinates.length; i++) {
                processCoordinates(coordinates[i]);
              }
            } else if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
              updateBoundingBoxCoordinates(coordinates[0], coordinates[1]);
            }
          }
        }
      
        // Process different geometry types
        switch (geometry.type) {
          case 'Point':
            updateBoundingBoxCoordinates(geometry.coordinates[0], geometry.coordinates[1]);
            break;
          case 'MultiPoint':
          case 'LineString':
          case 'Polygon':
            processCoordinates(geometry.coordinates);
            break;
          case 'MultiLineString':
          case 'MultiPolygon':
            for (let i = 0; i < geometry.coordinates.length; i++) {
              processCoordinates(geometry.coordinates[i]);
            }
            break;
          case 'GeometryCollection':
            for (let i = 0; i < geometry.geometries.length; i++) {
              calculateBoundingBox(geometry.geometries[i]);
            }
            break;
          default:
            throw new Error('Unsupported geometry type: ' + geometry.type);
        }
        // Return the calculated bounding box
        return [minX, minY, maxX, maxY];
      }

      function   mergeTiles(tileHash, tiles, limits) {
        var mergedTiles = [];
    
        for (var z = limits.max_zoom; z > limits.min_zoom; z--) {
    
            var parentTileHash = {};
            var parentTiles = [];
    
            for (var i = 0; i < tiles.length; i++) {
                var t = tiles[i];
    
                if (t[0] % 2 === 0 && t[1] % 2 === 0) {
                    var id2 = toID(t[0] + 1, t[1], z),
                        id3 = toID(t[0], t[1] + 1, z),
                        id4 = toID(t[0] + 1, t[1] + 1, z);
    
                    if (tileHash[id2] && tileHash[id3] && tileHash[id4]) {
                        tileHash[toID(t[0], t[1], t[2])] = false;
                        tileHash[id2] = false;
                        tileHash[id3] = false;
                        tileHash[id4] = false;
    
                        var parentTile = [t[0] / 2, t[1] / 2, z - 1];
    
                        if (z - 1 === limits.min_zoom) mergedTiles.push(parentTile);
                        else {
                            parentTileHash[toID(t[0] / 2, t[1] / 2, z - 1)] = true;
                            parentTiles.push(parentTile);
                        }
                    }
                }
            }
    
            for (i = 0; i < tiles.length; i++) {
                t = tiles[i];
                if (tileHash[toID(t[0], t[1], t[2])]) mergedTiles.push(t);
            }
    
            tileHash = parentTileHash;
            tiles = parentTiles;
        }
    
        return mergedTiles;
    }

    function   polygonCover(tileHash, tileArray, geom, zoom) {
        var intersections = [];
    
        for (var i = 0; i < geom.length; i++) {
            var ring = [];
            lineCover(tileHash, geom[i], zoom, ring);
    
            for (var j = 0, len = ring.length, k = len - 1; j < len; k = j++) {
                var m = (j + 1) % len;
                var y = ring[j][1];
    
                // add interesction if it's not local extremum or duplicate
                if ((y > ring[k][1] || y > ring[m][1]) && // not local minimum
                    (y < ring[k][1] || y < ring[m][1]) && // not local maximum
                    y !== ring[m][1]) intersections.push(ring[j]);
            }
        }
    
        intersections.sort(compareTiles); // sort by y, then x
    
        for (i = 0; i < intersections.length; i += 2) {
            // fill tiles between pairs of intersections
            y = intersections[i][1];
            for (var x = intersections[i][0] + 1; x < intersections[i + 1][0]; x++) {
                var id = toID(x, y, zoom);
                if (!tileHash[id]) {
                    tileArray.push([x, y, zoom]);
                }
            }
        }
    }
    
    function   compareTiles(a, b) {
        return (a[1] - b[1]) || (a[0] - b[0]);
    }
    
    function   lineCover(tileHash, coords, maxZoom, ring) {
        var prevX, prevY;
    
        for (var i = 0; i < coords.length - 1; i++) {
            var start = pointToTileFraction(coords[i][0], coords[i][1], maxZoom),
                stop = pointToTileFraction(coords[i + 1][0], coords[i + 1][1], maxZoom),
                x0 = start[0],
                y0 = start[1],
                x1 = stop[0],
                y1 = stop[1],
                dx = x1 - x0,
                dy = y1 - y0;
    
            if (dy === 0 && dx === 0) continue;
    
            var sx = dx > 0 ? 1 : -1,
                sy = dy > 0 ? 1 : -1,
                x = Math.floor(x0),
                y = Math.floor(y0),
                tMaxX = dx === 0 ? Infinity : Math.abs(((dx > 0 ? 1 : 0) + x - x0) / dx),
                tMaxY = dy === 0 ? Infinity : Math.abs(((dy > 0 ? 1 : 0) + y - y0) / dy),
                tdx = Math.abs(sx / dx),
                tdy = Math.abs(sy / dy);
    
            if (x !== prevX || y !== prevY) {
                tileHash[toID(x, y, maxZoom)] = true;
                if (ring && y !== prevY) ring.push([x, y]);
                prevX = x;
                prevY = y;
            }
    
            while (tMaxX < 1 || tMaxY < 1) {
                if (tMaxX < tMaxY) {
                    tMaxX += tdx;
                    x += sx;
                } else {
                    tMaxY += tdy;
                    y += sy;
                }
                tileHash[toID(x, y, maxZoom)] = true;
                if (ring && y !== prevY) ring.push([x, y]);
                prevX = x;
                prevY = y;
            }
        }
    
        if (ring && y === ring[0][1]) ring.pop();
    }
    
    function   appendHashTiles(hash, tiles) {
        var keys = Object.keys(hash);
        for (var i = 0; i < keys.length; i++) {
            tiles.push(fromID(+keys[i]));
        }
    }
    
    function  toID(x, y, z) {
        var dim = 2 * (1 << z);
        return ((dim * y + x) * 32) + z;
    }
    
    function  fromID(id) {
        var z = id % 32,
            dim = 2 * (1 << z),
            xy = ((id - z) / 32),
            x = xy % dim,
            y = ((xy - x) / dim) % dim;
        return [x, y, z];
    }
module.exports.getMosaicJsonUrl = getMosaicJsonUrl