const fs = require('fs')
const unzip = require('unzip')
const parse = require('csv-parse')
const async = require('async')
const request = require('request')
const querystring = require('querystring')

const AWS = require('aws-sdk')

const s3 = new AWS.S3()

const BUCKET = 'mrc-cost-reports'
let today = new Date()
today.setDate(today.getDate() - 1)
const this_day = today.toISOString().substr(8, 2)
const this_month = today.toISOString().substr(0, 7)

let KEY = '**REMOVED**-aws-billing-detailed-line-items-with-resources-and-tags-%.csv.zip'
let FILE = '**REMOVED**-aws-billing-detailed-line-items-with-resources-and-tags-%.csv'
let acum = []
let acum_day = 0

KEY = KEY.replace('%', this_month)
FILE = FILE.replace('%', this_month)

function processLine (line) {
  let date = line[14].split(' ')
  if (date[0] === this_month + '-' + this_day) {
    if (!acum_day[date[0]]) acum_day[date[0]] = 0
    if (!(acum[date[0] + ' - ' + line[5]])) acum[date[0] + ' - ' + line[5]] = 0

    if ((line[5] == 'Amazon Elastic Compute Cloud') && (line[10] == 'RunInstances')) {
      if (!(acum[date[0] + ' - ' + line[24]])) acum[date[0] + ' - ' + line[24]] = 0
      acum[date[0] + ' - ' + line[24]] = parseFloat(acum[date[0] + ' - ' + line[24] ]) + parseFloat(line[18])
    }
    acum_day = parseFloat(acum_day) + parseFloat(line[18])
  }

  return new Promise(function (resolve, reject) {
    resolve()
  })
};

function slackNotify (callback) {
  console.log('Sending to Slack...')
  let report = ''

  for (var key in acum) {
    report += key.toString().replace('&', ' ') + ': $' + acum[key].toFixed(2).toString().replace('&', ' ') + '\n'
  }

  let options = {
    url: '**REMOVED**',
    method: 'POST',
    form: 'payload={"channel": "#aws_reports", "username": "AWS", "text": "By EC2 \n```' + report + '\n``` \n Total Spent: `' + acum_day.toFixed(2) + '`", "icon_emoji": ":aws:"}'
  }

  // Start the request
  request(options, function (error, response, body) {
    if (!error && response.statusCode == 200) {
          // Print out the response body
      console.log(body)
      callback(null, 'Hello from Lambda')
    }
  })
}

exports.handler = (event, context, callback) => {
  s3.getObject({Bucket: BUCKET, Key: KEY }).createReadStream()
    .on('error', function (err) {
      console.log('ERROR: ', err)
    })
    .on('end', function () {
      fs.createReadStream('/tmp/' + FILE).pipe(parser)
    })
    .pipe(unzip.Extract({ path: '/tmp' }))

  let parser = parse({delimiter: ','}, function (err, data) {
    async.eachSeries(data, function (line, callback) {
      processLine(line).then(function () {
        callback()
      })
    }, function () {
      slackNotify(callback)
    })
  })
}
