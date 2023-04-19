export function joinObjects(obj, ojectToBeJoined, arrayOfKeysWanted = []) {
  // Add the new items to the object if they are not undefined
  if (arrayOfKeysWanted.length > 0) {
    arrayOfKeysWanted.forEach(wantedKey => {
      if (ojectToBeJoined[wantedKey] !== undefined) {
        obj[wantedKey] = ojectToBeJoined[wantedKey]; // eslint-disable-line functional/immutable-data
        return;
      }
    });

    return;
  }

  Object.keys(ojectToBeJoined).forEach(key => {
    if (ojectToBeJoined[key] !== undefined) {
      obj[key] = ojectToBeJoined[key]; // eslint-disable-line functional/immutable-data
      return;
    }

    return;
  });
}
