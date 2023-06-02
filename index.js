const express = require('express')
var bodyParser = require('body-parser')
const { Client } = require('pg')
const fs = require('fs')
const cors = require('cors')
const app = express()
const env = require('./environment')
const path = require('path')
const { getMosaicJsonUrl } = require('./tileutils')
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())

var aws = require('aws-sdk')

app.use(cors())

// mosaiqdev
// const client = new Client({
//     user:env.mosiaqClient.user,
//     host:env.mosiaqClient.host,
//     database:env.mosiaqClient.database,
//     password:env.mosiaqClient.password,
//     port:env.mosiaqClient.port,
// });

// localhost
const client = new Client({
  user: env.dbClient.user,
  host: env.dbClient.host,
  database: env.dbClient.database,
  password: env.dbClient.password,
  port: env.dbClient.port,
});




let authQuery = 
`SET postgis.gdal_vsi_options = 'AWS_ACCESS_KEY_ID=${env.s3Config_7a.accessKeyID} AWS_SECRET_ACCESS_KEY=${env.s3Config_7a.secretAccessKey} AWS_DEFAULT_REGION=${env.s3Config_7a.region}';
SET postgis.gdal_enabled_drivers = 'ENABLE_ALL';
SET postgis.enable_outdb_rasters = 1;
`

client.connect((err) => {
  if (err) {
    console.log("Error: ", err)
  } else {
    console.log(`DB Connected (${client.database})`,)
  }
})

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
    upload.on("httpUploadProgress",(progress)=>{
    let progressPercentage = Math.round(progress.loaded / progress.total * 100);
  })

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


app.get('/getFilters/:tableName', (req, res) => {

  let result = client.query(`
  SELECT column_name
FROM information_schema.columns
WHERE table_name = '${req.params.tableName}';
  `).then(result => {
    res.send(result.rows)
  })
})

app.post('/addPlay', (req, res) => {

  let geometry = JSON.stringify(req.body.geom)
  let result = client.query(
    `INSERT INTO hydrocarbons.published_play (_key,plyplaynam,geom ) VALUES (${req.body._key},'${req.body.playName}',ST_Multi(ST_Transform(ST_GeomFromGeoJSON('${geometry}'),23032)))`
  ).then((result, error) => {
    if (error) {
      res.send(error)
    } else
      res.send(result)
  })
})

app.post('/updateplay ', (req, res) => {
  console.log("hey")
  console.log(req)
  let geometry = JSON.stringify(req.body.updatedGeometry)
  let result = client.query(
    `UPDATE hydrocarbons.published_play SET geom = ST_Multi(ST_Transform(ST_GeomFromGeoJSON('${geometry}'),23032)) where id = ${req.body.featureId} `
  ).then((result, error) => {
    if (error) {
      res.send(error)
    } else
      res.send(result)
  })
})


app.get('/getFeatures/:tableName', (req, res) => {
  let result = client.query(
    `SELECT plyplaynam FROM ${req.params.tableName} `
  ).then((result, error) => {
    if (error) {
      res.send(error)
    } else
      res.send(result.rows);
    next(err)
  })
})

app.get('/getDistinctValues', (req, res) => {
  console.log(`SELECT distinct ${req.query.columnName} FROM ${req.query.schemaName}.${req.query.tableName} `
  )

  let result = client.query(
    `SELECT distinct ${req.query.columnName} FROM ${req.query.schemaName}.${req.query.tableName} `
  ).then((result, error) => {
    if (error) {
      res.send(error)
    } else
      res.send(result.rows)
  })
})

app.get('/updateStructuralElements', (req, res) => {

  newPolygons.forEach(async (polygons) => {
    let geometry = JSON.stringify(polygons.geom)
    let result = await client.query(`

      INSERT INTO hydrocarbons.structural_elements (name,geom) values ('${polygons.layer.toString()}', ST_Transform(ST_GeomFromGeoJSON('${geometry}'),23032));

      `).then(result => {
      resultArr.push(result.rows)
    })
  })
  res.send(resultArr)
})

app.post('/getRasterImage', (req, res) => {

  let geojson = JSON.stringify(req.body.geojson)
  let colormap = req.body.colormap
  let colormapQuery = ""
  if (colormap == 'default') {
    colormapQuery = "r.a"
  } else {
    colormapQuery = `st_colormap(r.a,'${colormap}')`

  }
  client.query(authQuery).then(() => {
    client.query(`

        with r as ( SELECT ST_Union(ST_Clip(r.rast, g)) as a
        FROM o_4_nyc_dem_cog AS r
        INNER JOIN
              st_transform(st_geomfromgeojson('${geojson}'),2263) as g
            ON ST_Intersects(r.rast, g) )
        select 'data:image/png;base64,' || encode(st_aspng(${colormapQuery}),'base64'),st_asgeojson(st_transform(st_envelope(r.a),4326)) from r
            `).then(result => {
      res.send(result.rows);
    })
  })
})

app.post('/getContourLines', (req, res) => {

  let geojson = JSON.stringify(req.body.geojson)

  client.query(authQuery).then(() => {
    client.query(`

with contours as (
  SELECT (ST_Contour(
    (
      SELECT ST_Union( ST_Clip(r.rast, g) )
  FROM o_3_nyc_dem_cog AS r
      INNER JOIN
            st_transform(st_geomfromgeojson('${geojson}'),2263) as g
          ON ST_Intersects(r.rast, g)
    ), 1, fixed_levels => ARRAY[100.0, 200.0, 300.0])).* 
  )
  
  select st_asgeojson(st_transform(geom,4326)) from contours

`).then(result => {
      res.send(result.rows);
    })
  })
})

app.post('/getHillshade', (req, res) => {

  let geojson = JSON.stringify(req.body.geojson)
  console.log(geojson)
  client.query(authQuery).then(() => {
    // client.query(`

    // SELECT 'data:image/png;base64,' || encode(ST_AsGDALRaster(st_hillshade(st_union(r.rast)), 'png'),'base64')
    // FROM o_3_nyc_dem_cog AS r
    //     INNER JOIN
    //           st_transform(st_geomfromgeojson('${geojson}'),2263) as g
    //         ON ST_Intersects(r.rast, g) 
    //         `).then(result => {
    //           res.send(result.rows)
    client.query(`
    
  with r as ( SELECT ST_Union(ST_Clip(r.rast, g)) as a
      FROM o_3_nyc_dem_cog AS r
          INNER JOIN
                st_transform(st_geomfromgeojson('${geojson}'),2263) as g
              ON ST_Intersects(r.rast, g) )
          select 'data:image/png;base64,' || encode(ST_AsGDALRaster(st_hillshade(r.a), 'png'),'base64'),st_asgeojson(st_transform(st_envelope(r.a),4326)) from r
              `).then(result => {
      console.log(result.rows)
      res.send(result.rows);
    })
  })
})

function convertBase64ToPNG(base64String, outputPath) {
  // Remove the data URL prefix and extract the base64 data
  const base64Data = base64String.replace(/^data:image\/png;base64,/, '');

  // Create a buffer from the base64 data
  const buffer = Buffer.from(base64Data, 'base64');

  // Write the buffer to the specified output path
  fs.writeFileSync(outputPath, buffer);

  console.log('Conversion complete!');
}

app.get("/getTiles/:z/:x/:y.png", (req, res) => {
  let { z, x, y } = req.params;
  console.log(x, y, z)
  client.query(authQuery).then(() => {
    client
      .query(
        `
        SELECT 'data:image/png;base64,' || encode(st_aspng(ST_Union( ST_Clip(r.rast, g.geom) )),'base64')
        FROM nyc_dem_3857 AS r
            INNER JOIN
              ST_TileEnvelope(${z},${x},${y}) AS g(geom)
                ON ST_Intersects(r.rast, g.geom);
            `
      )
      .then((result) => {
        console.log(result.rows);
        if (
          (result != null || result != undefined) &&
          result.rowCount > 0 &&
          result.rows[0]["?column?"]
        ) {
          let filename = "image.png";

          convertBase64ToPNG(result.rows[0]["?column?"], "./image.png");
          res.sendFile(path.join(__dirname, filename), () => {
            console.log("image sent");
          });
        } else {
          console.log("null");
        }
      });
  });
});

app.get('/getGridLinesTable',(req,res)=>{
client.query(`
SELECT *  FROM public."norway_gridLine" `).then(result=>res.send(result.rows))
})

app.post('/uploadMosaicJson',(req,res)=>{

  let mosaicjson =req.body.mosaicjson;
  let fileName=mosaicjson["name"]+'.json';
  
    fs.writeFile(fileName, JSON.stringify(mosaicjson), (err) => {
      if (err) throw err;
  
      const fileContent = fs.readFileSync(fileName);
  
    return  putFileObject('houston/test/',fileContent,mosaicjson.name+'.json')
      .then(data=> {
        res.send(data);
    })
      .catch(err=>{
        res.send(err)
      }).then(data=>{
        fs.unlinkSync(path.join(__dirname +"\\" + fileName));  
      })

})
 

})


app.listen(5000, (req, res) => {
  console.log('server started on port 5000')
})