import time
import requests
import re
from bs4 import BeautifulSoup

def write(path, text):
    with open(path, mode='w', encoding="utf-8") as f:
        f.write(text)

login_url = "https://ahrefs.com/user/login"
res = requests.get(login_url)
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

cookie = head.get("Set-Cookie")  # <class 'str'>
t = re.match("XSRF-TOKEN=(.+?);", cookie).group(1)
b = re.search("BSSESSID=(.+?);", cookie).group(1)
login_html = res.text
token = re.search('"_token" type="hidden" value="(.*?)"', login_html).group(1)
email = "foo@mail.com"
password = "pass"
return_to = r"https%3A%2F%2Fahrefs.com%2F"
c = f"XSRF-TOKEN={t};BSSESSID={b};"
user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36"
# headers = {
#     "cookie": cookie,
#     "_token": token,
#     "user-agent": user_agent,
#     "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
#     # "X-CSRF-Token": token
# }
headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "ja,en-US;q=0.9,en;q=0.8,und;q=0.7",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "cookie": c,
    "origin": "https://ahrefs.com",
    "referer": "https://ahrefs.com/user/login",
    "user-agent": user_agent,
    "_token": token,
    "X-CSRF-Token": token
}

login_url_g = (
    "https://ahrefs.com/user/login?_token=" + token 
    + "&email=" + email 
    + "&password=" + password 
    + r"&return_to=https%3A%2F%2Fahrefs.com%2F"
)
p = {
    "_token": token,
    "email": email,
    "password": password,
    "return_to": r"https://ahrefs.com/"
}
time.sleep(1)
res_signed_in = requests.post(
    login_url, headers=headers, data=p, allow_redirects=False
)



cookie_signed_in = res_signed_in.headers.get("Set-Cookie")  # 有効期限：4h
token_signed_in = re.match("XSRF-TOKEN=(.+?);", cookie_signed_in).group(1)
b_signed_in = re.search("BSSESSID=(.+?);", cookie_signed_in).group(1)
c_signed_in = f"XSRF-TOKEN={token_signed_in};BSSESSID={b_signed_in};"
# payload_signed_in = {
#     "_token": token,
#     "X-CSRF-Token": token,
#     "protocol": "http+%2B+https",
#     "mode": "auto",
#     "history_mode": "live",
#     "batch_requests": r"saruwakakun.com\n\rtwitter.com"
# }
# headers_signed_in = {
#     "Cookie": c_signed_in,
#     "_token": token_signed_in,
#     "User-Agent": user_agent,
#     "X-CSRF-Token": token_signed_in,
#     "content-type": "application/x-www-form-urlencoded; charset=UTF-8"
# }
headers_signed_in = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3",
    "accept-encoding": "gzip, deflate, br",
    "accept-language": "ja,en-US;q=0.9,en;q=0.8,und;q=0.7",
    "cookie": c_signed_in,
    "upgrade-insecure-requests": "1",
    "User-Agent": user_agent,
}
"""
    options.payload.batch_requests = urlParamOfDomainNames
    options.payload.protocol = "http+%2B+https"
    options.payload.mode = "auto"
    options.payload.history_mode = "live"
"""
domain1 = "saruwakakun.com"
domain2 = "twitter.com"
all_domain = f"{domain1}%0A{domain2}"
b_res = requests.get(
    f"https://ahrefs.com/batch-analysis?batch_requests={all_domain}", 
    headers=headers_signed_in
)
soup = BeautifulSoup(b_res.text, "html.parser")
tr_list = soup.select("#batch_data_table tbody")
write("o.html", soup.prettify())

re.compile(f'a[href="http://{domain1}"]', re.DOTALL)
