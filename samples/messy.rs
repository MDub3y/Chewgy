// A deliberately awful Rust file for testing Chewgy.
// Open it in the Extension Development Host and hit Ctrl+Alt+C.

use std::collections::HashMap;

// Over-engineering: a trait and a factory for two hardcoded cases.
trait Greeter {
    fn greet(&self) -> String;
}

struct EnglishGreeter;
struct FrenchGreeter;

impl Greeter for EnglishGreeter {
    fn greet(&self) -> String {
        return String::from("hello");
    }
}

impl Greeter for FrenchGreeter {
    fn greet(&self) -> String {
        return String::from("bonjour");
    }
}

struct GreeterFactoryBuilder;

impl GreeterFactoryBuilder {
    fn build(lang: &str) -> Box<dyn Greeter> {
        if lang == "fr" {
            Box::new(FrenchGreeter)
        } else {
            Box::new(EnglishGreeter)
        }
    }
}

// Hardcoded secret.
const API_TOKEN: &str = "sk-live-do-not-actually-do-this-1234567890";

// Panics on any bad input.
fn parse_port(raw: &str) -> u16 {
    raw.parse::<u16>().unwrap()
}

// Off-by-one, plus an index that can panic.
fn last_item(items: &Vec<String>) -> String {
    let idx = items.len();
    items[idx].clone()
}

// Non-idiomatic: manual index loop, needless clone, needless collect.
fn count_words(text: String) -> HashMap<String, i32> {
    let words: Vec<String> = text.split(" ").map(|w| w.to_string()).collect();
    let mut counts: HashMap<String, i32> = HashMap::new();
    let mut i = 0;
    while i < words.len() {
        let word = words[i].clone();
        if counts.contains_key(&word) {
            let current = counts.get(&word).unwrap().clone();
            counts.insert(word, current + 1);
        } else {
            counts.insert(word, 1);
        }
        i = i + 1;
    }
    return counts;
}

// This one is fine. Chewgy should leave it alone.
fn add(a: i32, b: i32) -> i32 {
    a + b
}

// Chewgy is told to keep quiet about the next line.
// chewgy-ignore
fn deliberately_bad() -> i32 { std::fs::read_to_string("nope").unwrap().len() as i32 }

fn main() {
    println!("{}", GreeterFactoryBuilder::build("fr").greet());
    println!("{}", API_TOKEN);
    println!("{}", parse_port("8080"));
    println!("{}", add(1, 2));
    println!("{:?}", count_words("a b a".to_string()));
    println!("{:?}", last_item(&vec!["x".to_string()]));
    println!("{}", deliberately_bad());
}
