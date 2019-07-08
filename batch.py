
import requests

res = requests.get("https://ahrefs.com/user/login")
head = res.headers
"""
    head: {
        'Server': 'nginx',
        'Date': 'Mon,
        08 Jul 2019 21:36:04 GMT',
        'Content-Type': 'text/html; charset=UTF-8',
        'Content-Length': '9852', 
        'Connection': 'keep-alive', 
        'Cache-Control': 'private, must-revalidate', 
        'pragma': 'no-cache', 
        'expires': '-1', 
        'Set-Cookie': '
            XSRF-TOKEN=bLAXl5d7Zyi3lxTYfMMYrgdTQLIcZELCaYgTY3xY; 
            expires=Tue, 09-Jul-2019 01:36:04 GMT; 
            Max-Age=14400; 
            path=/; 
            domain=.ahrefs.com; 
            secure, BSSESSID=mL0VZGDOQhGxUo4cvX3f1qLyH0Zu5zcUpnSgG4th; 
            expires=Tue, 09-Jul-2019 01:36:04 GMT; 
            Max-Age=14400; 
            path=/; 
            domain=.ahrefs.com; 
            secure; HttpOnly
        ', 
        'Vary': 'Accept-Encoding', 
        'Content-Encoding': 'gzip', 
        'Strict-Transport-Security': 'max-age=31536000'
    }
"""