# ******************************************************
# Sample ChatGPT python lambda code
# ******************************************************
import openai
import json
import datetime

#Please update your secret key in the following line
openai.api_key = "API-KEY-HERE"

def gpt_interface(prompt: str, engine: str = 'gpt-3.5-turbo-instruct', max_tokens: int = 500, temperature: float = 0.0, top_p: int = 1, frequency_penalty: int = 0., presence_penalty: int = 0) -> object:
 response = openai.Completion.create(
 engine=engine,
 prompt=prompt,
 max_tokens=max_tokens,
 temperature=temperature,
 top_p=top_p,
 frequency_penalty=frequency_penalty,
 presence_penalty=presence_penalty
 )
 return response


def lambda_handler(event, context):
 print("Event:", event)
 prompt = event['prompt']
 resp = gpt_interface(prompt)
 response_text = resp['choices'][0]['text'].strip()

 response = {
 "statusCode": 200,
 "headers": {},
 "body": response_text
 }

 return response