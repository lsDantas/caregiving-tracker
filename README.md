# Caregiving Tracker

A CLI tool for extracting caregiving time from a CSV file with entries of careviging events. Built with JavaScript and Node.js. Available under an AGPLv3 license.

## Development

To install dependencies, run:

```sh
npm install
```

For linting and formatting, this project uses ESLint and Prettier under an AirBnB style.

## Usage 

The CLI tool expects a CSV file with the following fields:

* `user_id` - String containing user identification
* `location_name` - String containing location name in uppercase
* `coordinates_latitude` - String with latitude coordinates
* `coordinates_longitude` - String with longitude coordinates
* `timestamp` - String with ISO format timestamp
* `event_type` - String containing either `ENTER` or `LEAVE`

To call the CLI tool, run:

```sh
node time.js [CSV file path] [selected user id] [start time] [end time]
```

Example of usage:

```sh
node time.js data.csv "1234-abcd" "2023-12-01T12:00:00.000Z" "2023-12-30T12:00:00.000Z"
```