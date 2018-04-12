#!/bin/bash

set -e

function finish {
  docker stop slugger-test-mongodb
}
trap finish EXIT

docker run -p 27017:27017 --name slugger-test-mongodb -d --rm mongo:3.4.6
yarn test
