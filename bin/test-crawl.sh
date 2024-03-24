#!/bin/bash

FILE=$1

if [ "${FILE}" == "" ]; then
    echo "usage: $0 crawl"
    exit 1
fi

eye --nope --quiet --pass-only-new rules/*.n3 ${FILE}