const express = require('express')
var bodyParser = require('body-parser')
const { Client } = require('pg')
const fs = require('fs')
const cors = require('cors')
const app = express()
const env = require('./environment')


app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())


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
    user:env.localhostClient.user,
    host:env.localhostClient.host,
    database:env.localhostClient.database,
    password:env.localhostClient.password,
    port:env.localhostClient.port,
});


client.connect((err) => {
  if (err) {
    console.log("Error: ", err)
  } else {
    console.log(`DB Connected (${client.database})`,)
  }
})

app.get('/', (req, res) => {

  //mosiaqdev
  let result = client.query(`
    SELECT * FROM hydrocarbons.published_play ;
    `).then(result => {
    res.send(result)
  })

  //localhost
  // let result =  client.query(`
  // SELECT * FROM wellbores."PublishedPlay" ;
  // `).then(result=>{
  //   res.send(result)
  // })

})



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

  client.query(`
  SET postgis.gdal_vsi_options = 'AWS_ACCESS_KEY_ID=${env.s3Config_7a.accessKeyID} AWS_SECRET_ACCESS_KEY=${env.s3Config_7a.secretAccessKey} AWS_DEFAULT_REGION=${env.s3Config_7a.region}';  `).then(() => {
    client.query(`
    
    SELECT 'data:image/png;base64,' || encode(st_aspng(ST_Union( ST_Clip(r.rast, g) )),'base64')
    FROM nyc_dem_cog AS r
        INNER JOIN
              st_transform(st_geomfromgeojson('${geojson}'),2263) as g
            ON ST_Intersects(r.rast, g) `).then(result => {
      res.send(result.rows);


    })
  })
})

app.post('/getContourLines', (req, res) => {

  let geojson = JSON.stringify(req.body.geojson)

  client.query(`
  SET postgis.gdal_vsi_options = 'AWS_ACCESS_KEY_ID=${env.s3Config_7a.accessKeyID} AWS_SECRET_ACCESS_KEY=${env.s3Config_7a.secretAccessKey} AWS_DEFAULT_REGION=${env.s3Config_7a.region}';  `).then(() => {
    client.query(`

with contours as (


  SELECT (ST_Contour(
    (
      SELECT ST_Union( ST_Clip(r.rast, g) )
  FROM nyc_dem_cog AS r
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


app.listen(5000, (req, res) => {
  console.log('server started on port 5000')
})