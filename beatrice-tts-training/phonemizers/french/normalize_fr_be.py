#!/usr/bin/env python3
"""
French (Belgium) text normalizer for Beatrice TTS.

Handles:
- Numbers (cardinal, ordinal)
- Dates (Belgian/French format)
- Currency (EUR)
- Phone numbers
- Belgian VAT numbers
- Abbreviations
"""

import re

UNITS = ["z\u00e9ro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"]
TEENS = ["dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"]
TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"]

ORDINALS = ["z\u00e9roi\u00e8me", "premier", "deuxi\u00e8me", "troisi\u00e8me", "quatri\u00e8me", "cinqui\u00e8me",
            "sixi\u00e8me", "septi\u00e8me", "huiti\u00e8me", "neuvi\u00e8me"]

MONTHS = ["janvier", "f\u00e9vrier", "mars", "avril", "mai", "juin",
          "juillet", "ao\u00fbt", "septembre", "octobre", "novembre", "d\u00e9cembre"]


def cardinal_to_words(n: int) -> str:
    """Convert cardinal number to French words."""
    if n < 0:
        return "moins " + cardinal_to_words(-n)
    if n < 10:
        return UNITS[n]
    if n < 20:
        return TEENS[n - 10]
    if n < 60:
        ten = n // 10
        unit = n % 10
        if unit == 0:
            return TENS[ten]
        if ten == 7:
            return "soixante-" + TEENS[unit]
        if ten == 9:
            return "quatre-vingt-" + TEENS[unit]
        return TENS[ten] + "-" + UNITS[unit]
    if n < 80:
        rest = n - 60
        if rest == 0:
            return "soixante"
        return "soixante-" + cardinal_to_words(rest)
    if n < 100:
        rest = n - 80
        if rest == 0:
            return "quatre-vingts"
        return "quatre-vingt-" + cardinal_to_words(rest)
    if n < 1000:
        hundred = n // 100
        rest = n % 100
        if hundred == 1:
            return "cent" + ("-" + cardinal_to_words(rest) if rest else "")
        return cardinal_to_words(hundred) + " cent" + ("s" if rest == 0 and hundred > 1 else "") + ("-" + cardinal_to_words(rest) if rest else "")
    if n < 1_000_000:
        thousand = n // 1000
        rest = n % 1000
        thousand_word = "mille" if thousand == 1 else cardinal_to_words(thousand) + " mille"
        return thousand_word + (" " + cardinal_to_words(rest) if rest else "")
    if n < 1_000_000_000:
        million = n // 1_000_000
        rest = n % 1_000_000
        return cardinal_to_words(million) + " million" + ("s" if million > 1 else "") + (" " + cardinal_to_words(rest) if rest else "")
    
    return str(n)


def ordinal_to_words(n: int) -> str:
    """Convert ordinal to French words."""
    if n < 10:
        return ORDINALS[n]
    return cardinal_to_words(n) + "i\u00e8me"


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
            result = cardinal_to_words(integer_part) + " virgule " + " ".join(UNITS[int(d)] for d in decimal_part if d.isdigit())
            return result
        return cardinal_to_words(int(num_str))
    
    text = re.sub(r"(\d+)(?:er|re|\u00e8me|\u00b0)", replace_ordinal, text)
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
    
    text = re.sub(r"\b(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?\b", replace_date, text)
    return text


def normalize_currency(text: str) -> str:
    def replace_euro(match):
        amount_str = match.group(1).replace(".", "").replace(",", ".")
        if "." in amount_str:
            parts = amount_str.split(".")
            euros = int(parts[0])
            cents = int(parts[1].ljust(2, "0")[:2])
            if cents > 0:
                return f"{cardinal_to_words(euros)} euros et {cardinal_to_words(cents)} centimes"
            return f"{cardinal_to_words(euros)} euros"
        return f"{cardinal_to_words(int(amount_str))} euros"
    
    text = re.sub(r"(?:\u20ac|EUR)\s*([\d.,]+)", replace_euro, text)
    text = re.sub(r"([\d.,]+)\s*(?:\u20ac|EUR)", replace_euro, text)
    return text


def normalize_phone_numbers(text: str) -> str:
    def replace_phone(match):
        digits = re.sub(r"[^\d]", "", match.group(0))
        if len(digits) < 7:
            return match.group(0)
        digit_words = " ".join(UNITS[int(d)] for d in digits)
        return f"num\u00e9ro {digit_words}"
    
    text = re.sub(r"\b0\d[\d\s./-]{6,}\b", replace_phone, text)
    return text


def normalize_abbreviations(text: str) -> str:
    abbreviations = {
        r"\bTVA\b": "taxe sur la valeur ajout\u00e9e",
        r"\bN\u00b0\b": "num\u00e9ro",
        r"\bca\.?\b": "circa",
        r"\bc-\u00e0-d\b": "c'est-\u00e0-dire",
        r"\betc\.?\b": "et cetera",
        r"\bpp\.?\b": "pages",
        r"\bd\.?r\b": "docteur",
        r"\bM\.\b": "monsieur",
        r"\bMme\b": "madame",
        r"\bMlle\b": "mademoiselle",
    }
    
    for pattern, expansion in abbreviations.items():
        text = re.sub(pattern, expansion, text, flags=re.IGNORECASE)
    
    return text


def normalize(text: str) -> str:
    """Full normalization pipeline for fr-BE text."""
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
        "Le prix est de \u20ac120,50.",
        "Rendez-vous le 15/03/2026.",
        "Appelez le 02 123 45 67.",
        "C'est la 1\u00e8re fois.",
        "J'ai pay\u00e9 \u20ac1.234,56.",
        "Le num\u00e9ro d'entreprise belge est 0123.456.789.",
    ]
    
    for sentence in test_sentences:
        print(f"IN:  {sentence}")
        print(f"OUT: {normalize(sentence)}")
        print()
