
import React from 'react'
import mapboxgl from 'mapbox-gl'
import axios from 'axios';
import io from 'socket.io-client';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;

class App extends React.Component {

    constructor(props) {
      super(props);
      this.state = {
        lng: -73.996207,
        lat: 40.717573,
        zoom: 17,
        waypointTracker: 0,
        newJob: false,
        intervalId: 0,
        driverId: Math.ceil(Math.random() * 248)
      };
      this.pointOnMap = this.pointOnMap.bind(this);
    }

    pointOnMap = (value) => {
      let newWaypoint = this.state.waypointTracker + 1;
      this.setState({waypointTracker: newWaypoint})
        return {
            "type": "Point",
            "coordinates": value
        };
    }

    componentDidMount() {

      const socket = io(process.env.REACT_APP_SOCKET_SERVER);

      window.onbeforeunload = (e) => {
        socket.disconnect();
      };

      const { lng, lat, zoom } = this.state;

      const map = new mapboxgl.Map({
        container: this.mapContainer,
        //style: 'mapbox://styles/mapbox/streets-v9',
        style: 'mapbox://styles/danieljameskay/cjgzfw1ac000b2stladr4lg20',
        center: [lng, lat],
        zoom
      });

      map.on('move', () => {
        const { lng, lat } = map.getCenter();

        this.setState({
          lng: lng.toFixed(4),
          lat: lat.toFixed(4),
          zoom: map.getZoom().toFixed(2)
        });
      });

      map.on('load', () => {
        this.setState({newJob: true})

        // Send to Kafa that the drive is available.

        map.addSource('driver', {
          "type": "geojson",
          "data":{
              "type": "Point",
              "coordinates": [-73.996207, 40.717573]
          }
        });

      map.addLayer({
        "id": "driver",
        "source": "driver",
        "type": "circle",
        "paint": {
          "circle-radius": 12,
          "circle-color": "#b5563e"
        }
      });  

      // Emits vehicles location every 2 seconds. This needs sending to Kafka.
      setInterval(() => {
        socket.emit("currentLoc", `${this.state.driverId}|${map.getSource('driver')._data.coordinates.toString()}`)
      }, 2000);

    });

    map.on('click', (e) => {

      if(map.getLayer('route')) {
        map.removeLayer('route');
        map.removeSource('route');
        map.removeLayer('end');
        map.removeSource('end');
      }

      const currentPos = map.getSource('driver')._data.coordinates.toString();
      const destPos = Object.values(e.lngLat).toString();

      // creates the source for the end point
      map.addSource('end', {
        "type": "geojson",
        "data":{
            "type": "Point",
            "coordinates": Object.values(e.lngLat)
        }
      });

      // creates a layer to display the end point on the map.
      map.addLayer({
        "id": "end",
        "source": 'end',
        "type": "circle",
        "paint": {
          "circle-radius": 12,
          "circle-color": "#b5563e"
        }
      });

      // Make a call to the directions api to get the route information.
      axios.get(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${currentPos};${destPos}?access_token=pk.eyJ1IjoiZGFuaWVsamFtZXNrYXkiLCJhIjoiY2pnZ25xanU5MmRldDMzcGY3ZWhwOWE5biJ9.vEgSv9Vy49SODOG2U5PopA&overview=full&geometries=geojson`)
        .then((response) => {

          // get the geometry from the data.
          const route = response.data.routes[0].geometry;

          // Send to Kafa that the drive is not available.
          this.setState({newJob: false})
          console.log('Event sent to Kafka: The driver is on its way to a customer.');

          // create a source of data for the route using the payload data.
          map.addSource('route', {
            "type": 'geojson',
            "data": {
              "type": 'Feature',
              "geometry": route
            }
          });

          // create a layer which is going to display the route using the route source for data.
          map.addLayer({
            "id": 'route',
            "type": 'line',
            "source": 'route',
            "paint": {
              "line-color": "#b5563e",
              'line-width': 6
            }
          });


          if(this.state.newJob === false) {

            let intervalId = setInterval(() => {
              map.getSource('driver').setData(this.pointOnMap(route.coordinates[this.state.waypointTracker]));
              if(this.state.waypointTracker === route.coordinates.length) {
                console.log('Event sent to Kafka: The driver has reached its destination.')
                this.setState({waypointTracker: 0})
                clearInterval(this.state.intervalId);
                map.removeLayer('route');
                map.removeSource('route');
                map.removeLayer('end');
                map.removeSource('end');
                console.log('Event sent to Kafka: The driver is ready for a new route.')
                this.setState({newJob: true})
              }
            }, 2000);
            this.setState({intervalId})
          }


        })
        .catch((e) => {
          console.log(e);
        })

    });

  }

  render() {
    const { lng, lat, zoom } = this.state;

    return (
      <div>
        <div className="inline-block absolute top left mt12 ml12 bg-darken75 color-white z1 py6 px12 round-full txt-s txt-bold">
          <div>{`Longitude: ${lng} Latitude: ${lat} Zoom: ${zoom}`}</div>
        </div>
        <div ref={el => this.mapContainer = el} className="absolute top right left bottom" />
      </div>
    );
  }
}

export default App
