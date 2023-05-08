
import urllib.request, json 
import qgis.core

json_url = 'https://factmaps.npd.no/arcgis/rest/services/FactMaps?f=pjson'

# download the services json
with urllib.request.urlopen(json_url) as url:
    data = json.loads(url.read().decode())

    
# get services from the json
services = data['services']



num = 0

# get name and type from list 
service_name = services[num]['name']
service_type = services[num]['type']

## get layers from service
layers_url = f"https://factmaps.npd.no/arcgis/rest/services/{service_name}/{service_type}/layers?f=pjson"
#
## download the layers json
with urllib.request.urlopen(layers_url) as url:
    data = json.loads(url.read().decode())
    


layers = data['layers']
tables = data['tables']
wellbore_layers=[]
wellbore_tables=[]

for layer in layers:
   if (('wellbore' in layer['name'] or 'Wellbore' in layer['name']) and layer['type']=='Feature Layer'):
       wellbore_layers.append(layer)

   

#print (layer_indexes)
print (len(wellbore_layers) )
   
## pick a layer
layer_indexes = []
for layer in wellbore_layers:
   layer_indexes.append(layer['id'])
   layer_index=layer['id']
   uri=f"crs='EPSG:4326' url='https://factmaps.npd.no/arcgis/rest/services/{service_name}/{service_type}/{layer_index}"
   lyr=QgsVectorLayer(uri,layer['name'], "arcgisfeatureserver")
   QgsProject.instance().addMapLayer(lyr)
   

print (layer['name'])




for table in tables:
    if(('wellbore' in table['name'] or 'Wellbore' in table['name'])):
        wellbore_tables.append(table)
        
     
#print(table_indexes)
print (len(wellbore_tables) )

table_indexes= []
for table in wellbore_tables:
    table_indexes.append(table['id'])
    table_index = table['id']
    uri=f"url='https://factmaps.npd.no/arcgis/rest/services/{service_name}/{service_type}/{table_index}"
    lyr =QgsVectorLayer (uri,table['name'],"arcgismapserver")
    QgsProject.instance().addMapLayer(lyr)
    
    









    layers = QgsProject.instance().mapLayers()
wellbore_layers=[]
#print(layers)

for layer in layers:
    if('WELLBORE' in layer ):
        wellbore_layers.push(layer)
        print(layer)
        
        
myLayer = 
uri = QgsDataSourceUri()
# set host name, port, database name, username and password
uri.setConnection("", "", "", "", "")
# set database schema, table name, geometry column and optionally
# subset (WHERE clause)
uri.setDataSource("public", "nyc_streets", "geom", "cityid = 2643",)

vlayer = QgsVectorLayer(uri.uri(False), "nyc_streets", "postgres")

QgsProject.instance().addMapLayer(vlayer)

QgsVectorLayerExporter.exportLayer("WELLBORE_PALY_SLIDE_6301b11f_b914_4ac5_af0d_729d1956c368",uri,
