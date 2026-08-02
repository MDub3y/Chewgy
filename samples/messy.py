# A deliberately awful Python file, to prove Chewgy is language-agnostic.

import os
import json
import subprocess

API_KEY = "sk-live-please-do-not-commit-this-0987654321"


# Over-engineering: an abstract factory for two constants.
class AbstractGreeterFactoryBase:
    def create(self, lang):
        raise NotImplementedError


class GreeterFactory(AbstractGreeterFactoryBase):
    def create(self, lang):
        if lang == "fr":
            return "bonjour"
        else:
            return "hello"


# Shell injection.
def run_user_command(user_input):
    return subprocess.call("echo " + user_input, shell=True)


# Mutable default argument.
def add_item(item, bucket=[]):
    bucket.append(item)
    return bucket


# Bare except swallows everything, including KeyboardInterrupt.
def load_config(path):
    try:
        f = open(path)
        data = json.loads(f.read())
        return data
    except:
        return None


# Non-idiomatic: index loop, manual counter, string concat in a loop.
def count_words(text):
    words = text.split(" ")
    counts = {}
    i = 0
    while i < len(words):
        w = words[i]
        if w in counts.keys():
            counts[w] = counts[w] + 1
        else:
            counts[w] = 1
        i = i + 1
    return counts


# This one is fine.
def add(a, b):
    return a + b


# chewgy-ignore-start
def intentionally_horrible():
    exec(os.environ.get("PAYLOAD", "pass"))
# chewgy-ignore-end


if __name__ == "__main__":
    print(GreeterFactory().create("fr"))
    print(add(1, 2))
    print(count_words("a b a"))
