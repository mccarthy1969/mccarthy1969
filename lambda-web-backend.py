#******************************************************************************************
# Author - Michael McCarthy
# This lambda function will act as the backend for the loadbalancer and must be in a separate
# target group. You need to ensure that the healthcheck is enabled, else the function does # NOTE:
# turn healthy. Must have the path in LB as /lambda or /lambda/*
#******************************************************************************************

def lambda_handler(event, context):
    response = {
        "statusCode": 200,
        "statusDescription": "200 OK",
        "isBase64Encoded": False,
        "headers": {
        "Content-Type": "text/html; charset=utf-8"
        }
    }

    response['body'] = """
    <html>
        <head>
            <title>Lambda Backend Test</title>
            <style>
                html, body {
                margin: 0; padding: 0;
                font-family: arial; font-weight: 10; font-size: 1em;
                text-align: center;
            }
            </style>
        </head>
        <body>
            <p><h1>Lambda Backend Test</h1></p>
        </body>
    </html>
    """

    return response
