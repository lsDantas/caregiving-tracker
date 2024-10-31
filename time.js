// Main script starts on line 215
const fs = require('fs');
const { parse } = require('csv-parse');
const { chain } = require('lodash');
const { DateTime, Duration } = require('luxon');

const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime());

const convertCsvEntryToEventRecord = (entry) => {
  const eventDate = new Date(entry.timestamp);

  if (!isValidDate(eventDate)) {
    throw new Error('Invalid timestamp in event records.');
  }

  return {
    userId: entry.user_id,
    locationName: entry.location_name,
    coordinatesLatitude: entry.coordinates_latitude,
    coordinatesLongitude: entry.coordinates_longitude,
    timestamp: entry.timestamp,
    eventType: entry.event_type,
    eventDate,
  };
};

const getDifferenceInRoundedMinutes = (earlierDate, laterDate) => {
  const elapsedMilliseconds = laterDate - earlierDate;
  const { minutes: elapsedMinutes } = Duration.fromMillis(elapsedMilliseconds).shiftTo('minutes');

  return Math.ceil(elapsedMinutes);
};

const calculateCaregivingTimeReducer = (
  {
    lastEventType,
    lastEventLocation,
    lastEventDate,
    timeCaregivingInMin,
    timeTravelingInMin,
    startDate,
  },
  { locationName, eventType, eventDate },
  idx,
) => {
  const updatedLastLocation = {
    lastLocationName: locationName,
    lastEventType: eventType,
    lastEventDate: eventDate,
  };

  // Initial caregiving event entry
  if (idx === 0) {
    // Count time if user is in the middle of a caregiving session at a non-home location
    const initialCaregivingTime = eventType === 'LEAVE' && locationName !== 'HOME'
      ? getDifferenceInRoundedMinutes(startDate, eventDate)
      : 0;

    return {
      ...updatedLastLocation,
      timeCaregivingInMin: initialCaregivingTime,
      timeTravelingInMin,
      startDate,
    };
  }

  // Remaining caregiving event entries
  const hasSpentTimeAtLocation = lastEventType === 'ENTER' && eventType === 'LEAVE';
  const hasTraveledToLocation = lastEventType === 'LEAVE' && eventType === 'ENTER';

  if (hasSpentTimeAtLocation) {
    if (lastEventLocation !== 'HOME') {
      // Add time spent caregiving at a non-home location
      const sessionDurationInMin = getDifferenceInRoundedMinutes(
        lastEventDate,
        eventDate,
      );

      return {
        ...updatedLastLocation,
        timeCaregivingInMin: timeCaregivingInMin + sessionDurationInMin,
        timeTravelingInMin,
        startDate,
      };
    }
  } else if (hasTraveledToLocation) {
    // Add time spent traveling if within relevance time window
    const relevanceTimeLimitDate = DateTime
      .fromJSDate(lastEventDate)
      .plus({ hours: 2 })
      .toJSDate();

    const relevantTravelTimeInMin = eventDate <= relevanceTimeLimitDate
      ? getDifferenceInRoundedMinutes(lastEventDate, eventDate)
      : 0;

    return {
      ...updatedLastLocation,
      timeCaregivingInMin: timeCaregivingInMin + relevantTravelTimeInMin,
      timeTravelingInMin: timeTravelingInMin + relevantTravelTimeInMin,
      startDate,
    };
  } else {
    console.log(
      'Inconsistent data. Encountered ENTER/ENTER or LEAVE/LEAVE event chain.',
    );
  }

  return {
    ...updatedLastLocation,
    timeCaregivingInMin,
    timeTravelingInMin,
    startDate,
  };
};

const getTimeUnitSubstring = (count, timeUnit) => {
  // Omit quantity altogether when zero
  if (count === 0) {
    return '';
  }

  // Add plural form of unit when relevant
  const timeUnitString = count > 0
    ? `${timeUnit}s`
    : timeUnit;

  return `${count} ${timeUnitString}`;
};

const getTimeSubstring = (hours, minutes) => {
  const hoursSubstring = getTimeUnitSubstring(hours, 'hour');
  const minutesSubstring = getTimeUnitSubstring(minutes, 'minute');

  const timeSubstring = hoursSubstring !== 0 && minutesSubstring !== 0
    ? `${hoursSubstring} and ${minutesSubstring}`
    : `${hoursSubstring}${minutesSubstring}`;

  return timeSubstring;
};

const getFormattedUserReport = (
  timeCaregivingInMin,
  timeTravelingInMin,
  selectedUserId,
  startDate,
  endDate,
) => {
  const {
    hours: caregivingHours,
    minutes: caregivingMinutes,
  } = Duration.fromObject({ minutes: timeCaregivingInMin }).shiftTo('hours', 'minutes');
  const {
    hours: travelingHours,
    minutes: travelingMinutes,
  } = Duration.fromObject({ minutes: timeTravelingInMin }).shiftTo('hours', 'minutes');

  // User did not spend time caregiving
  if (caregivingHours === 0 && caregivingMinutes === 0) {
    return `The user with id "${selectedUserId}" did not spend time performing caregiving between ${startDate.toISOString()} and ${endDate.toISOString()}.`;
  }

  // User spent time caregiving
  const caregivingTimeSubstring = getTimeSubstring(caregivingHours, caregivingMinutes);
  const travelingTimeSubstring = getTimeSubstring(travelingHours, travelingMinutes);

  const travelingSubstring = travelingHours === 0 && travelingMinutes === 0
    ? ''
    : `, of which ${travelingTimeSubstring} was spent travelling`;

  return `The user with id “${selectedUserId}” spent ${caregivingTimeSubstring} performing caregiving duties between ${startDate.toISOString()} and ${endDate.toISOString()}${travelingSubstring}.`;
};

const getCaregivingEntryParser = (selectedUserId, startDate, endDate) => {
  const parseCaregivingEvents = (parsingErr, eventEntries) => {
    if (parsingErr) {
      throw new Error('Unable to parse CSV file.');
    }

    const isSelectedUser = ({ userId }) => userId === selectedUserId;
    const isInTimeInterval = ({ eventDate }) => eventDate >= startDate && eventDate < endDate;
    const isRelevantRecord = (record) => isSelectedUser(record) && isInTimeInterval(record);

    const relevantUserRecords = chain(eventEntries)
      .map(convertCsvEntryToEventRecord)
      .filter(isRelevantRecord)
      .sortBy('eventDate')
      .value();

    const {
      timeCaregivingInMin,
      timeTravelingInMin,
    } = relevantUserRecords.reduce(calculateCaregivingTimeReducer, {
      timeTravelingInMin: 0,
      timeCaregivingInMin: 0,
      lastEventType: null,
      lastEventDate: null,
      lastLocationName: null,
      startDate,
    });

    const template = getFormattedUserReport(
      timeCaregivingInMin,
      timeTravelingInMin,
      selectedUserId,
      startDate,
      endDate,
    );
    console.log(template);
  };

  return parseCaregivingEvents;
};

// Main script

// Read required CLI arguments
if (process.argv.length !== 6) {
  console.log('Incorrect number of arguments.');
  console.log(
    'Usage: node time.js [file path] [selected user id] [start time] [end time]',
  );
  process.exit(1);
}

const [, , filePath, selectedUserId, startTime, endTime] = process.argv;

try {
  // Verify if timestamps are in ECMAScript date and time format
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new Error('Invalid start or end time.');
  }

  // Read CSV file with path provided through the CLI
  const stream = fs.createReadStream(filePath);

  stream.on('error', () => {
    throw new Error('Unable to read CSV file.');
  });

  // Parse caregiving event records on CSV file
  const parseCaregivingEvents = getCaregivingEntryParser(selectedUserId, startDate, endDate);
  const parser = parse({ delimiter: ',', columns: true }, parseCaregivingEvents);

  stream.pipe(parser);
} catch (err) {
  console.log(err?.message ?? err);
  process.exit(1);
}
