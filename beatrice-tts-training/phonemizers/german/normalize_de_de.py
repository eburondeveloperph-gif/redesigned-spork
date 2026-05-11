#!/usr/bin/env python3
"""
German (de-DE) text normalizer for Beatrice TTS.

Handles:
- Numbers (cardinal, ordinal)
- Dates
- Currency (EUR)
- Phone numbers
- Abbreviations
- German compound words
"""

import re

UNITS = ["null", "eins", "zwei", "drei", "vier", "f\u00fcnf", "sechs", "sieben", "acht", "neun"]
TEENS = ["zehn", "elf", "zw\u00f6lf", "dreizehn", "vierzehn", "f\u00fcnfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"]
TENS = ["", "", "zwanzig", "drei\u00dfig", "vierzig", "f\u00fcnfzig", "sechzig", "siebzig", "achtzig", "neunzig"]

ORDINALS = ["nullter", "erster", "zweiter", "dritter", "vierter", "f\u00fcnfter",
            "sechster", "siebter", "achter", "neunter"]

MONTHS = ["Januar", "Februar", "M\u00e4rz", "April", "Mai", "Juni",
          "Juli", "August", "September", "Oktober", "November", "Dezember"]


def cardinal_to_words(n: int) -> str:
    """Convert cardinal number to German words."""
    if n < 0:
        return "minus " + cardinal_to_words(-n)
    if n < 10:
        return UNITS[n]
    if n < 20:
        return TEENS[n - 10]
    if n < 100:
        ten = n // 10
        unit = n % 10
        if unit == 0:
            return TENS[ten]
        if unit == 1:
            return "einund" + TENS[ten]
        return UNITS[unit] + "und" + TENS[ten]
    if n < 1000:
        hundred = n // 100
        rest = n % 100
        if rest == 0:
            return (UNITS[hundred] if hundred > 1 else "ein") + "hundert"
        return (UNITS[hundred] if hundred > 1 else "ein") + "hundert" + cardinal_to_words(rest)
    if n < 1_000_000:
        thousand = n // 1000
        rest = n % 1000
        if rest == 0:
            return (cardinal_to_words(thousand) if thousand > 1 else "ein") + "tausend"
        return (cardinal_to_words(thousand) if thousand > 1 else "ein") + "tausend" + cardinal_to_words(rest)
    if n < 1_000_000_000:
        million = n // 1_000_000
        rest = n % 1_000_000
        if rest == 0:
            return cardinal_to_words(million) + " Million" + ("en" if million > 1 else "")
        return cardinal_to_words(million) + " Million" + ("en" if million > 1 else "") + " " + cardinal_to_words(rest)
    
    return str(n)


def ordinal_to_words(n: int) -> str:
    """Convert ordinal to German words."""
    if n < 10:
        return ORDINALS[n]
    # For larger ordinals, add "te" or "ste"
    word = cardinal_to_words(n)
    if n <= 19:
        return word + "te"
    return word + "ste"


def normalize_numbers(text: str) -> str:
    def replace_ordinal(match):
        num = int(match.group(1))
        return ordinal_to_words(num)
    
    def replace_cardinal(match):
        num_str = match.group(0)
        if "." in num_str or "," in num_str:
            parts = re.split(r"[.,]", num_str)
            integer_part = int(parts[0]) if parts[0] else 0
            decimal_part = parts[1] if len(parts) > 1 else ""
            result = cardinal_to_words(integer_part) + " Komma " + " ".join(UNITS[int(d)] for d in decimal_part if d.isdigit())
            return result
        return cardinal_to_words(int(num_str))
    
    text = re.sub(r"(\d+)(?:te|ste|\.)\b", replace_ordinal, text)
    text = re.sub(r"\b\d+(?:[.,]\d+)?\b", replace_cardinal, text)
    return text


def normalize_dates(text: str) -> str:
    def replace_date(match):
        day = int(match.group(1))
        month = int(match.group(2))
        year_str = match.group(3)
        month_name = MONTHS[month - 1] if 1 <= month <= 12 else str(month)
        if year_str:
            year = int(year_str)
            return f"{cardinal_to_words(day)} {month_name} {cardinal_to_words(year)}"
        return f"{cardinal_to_words(day)} {month_name}"
    
    text = re.sub(r"\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b", replace_date, text)
    return text


def normalize_currency(text: str) -> str:
    def replace_euro(match):
        amount_str = match.group(1).replace(".", "").replace(",", ".")
        if "." in amount_str:
            parts = amount_str.split(".")
            euros = int(parts[0])
            cents = int(parts[1].ljust(2, "0")[:2])
            if cents > 0:
                return f"{cardinal_to_words(euros)} Euro und {cardinal_to_words(cents)} Cent"
            return f"{cardinal_to_words(euros)} Euro"
        return f"{cardinal_to_words(int(amount_str))} Euro"
    
    text = re.sub(r"(?:\u20ac|EUR)\s*([\d.,]+)", replace_euro, text)
    text = re.sub(r"([\d.,]+)\s*(?:\u20ac|EUR)", replace_euro, text)
    return text


def normalize_phone_numbers(text: str) -> str:
    def replace_phone(match):
        digits = re.sub(r"[^\d]", "", match.group(0))
        if len(digits) < 7:
            return match.group(0)
        digit_words = " ".join(UNITS[int(d)] for d in digits)
        return f"Telefonnummer {digit_words}"
    
    text = re.sub(r"\b0\d[\d\s./-]{6,}\b", replace_phone, text)
    return text


def normalize_abbreviations(text: str) -> str:
    abbreviations = {
        r"\bca\.?\b": "circa",
        r"\bz\.B\.?\b": "zum Beispiel",
        r"\betc\.?\b": "et cetera",
        r"\bd\.h\.?\b": "das hei\u00dft",
        r"\bggf\.?\b": "gegebenenfalls",
        r"\bNr\.?\b": "Nummer",
        r"\bS\.\b": "Seite",
        r"\bHr\.?\b": "Herr",
        r"\bFr\.?\b": "Frau",
        r"\bDr\.?\b": "Doktor",
        r"\bProf\.?\b": "Professor",
        r"\bUSt\.?\b": "Umsatzsteuer",
        r"\bMwSt\.?\b": "Mehrwertsteuer",
        r"\bGmbH\b": "Gesellschaft mit beschr\u00e4nkter Haftung",
        r"\bAG\b": "Aktiengesellschaft",
    }
    
    for pattern, expansion in abbreviations.items():
        text = re.sub(pattern, expansion, text, flags=re.IGNORECASE)
    
    return text


def normalize(text: str) -> str:
    """Full normalization pipeline for de-DE text."""
    text = text.strip()
    text = normalize_abbreviations(text)
    text = normalize_currency(text)
    text = normalize_dates(text)
    text = normalize_phone_numbers(text)
    text = normalize_numbers(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


if __name__ == "__main__":
    test_sentences = [
        "Der Preis betr\u00e4gt \u20ac120,50.",
        "Treffen am 15.03.2026.",
        "Rufen Sie 030 123 45 67 an.",
        "Das ist das 1. Mal.",
        "Ich habe \u20ac1.234,56 bezahlt.",
        "Die USt.-Nummer lautet DE123456789.",
    ]
    
    for sentence in test_sentences:
        print(f"IN:  {sentence}")
        print(f"OUT: {normalize(sentence)}")
        print()
