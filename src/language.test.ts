import assert from "node:assert/strict";
import test from "node:test";
import { chooseReplyLanguage } from "./language.js";

test("recognizes Hindi written in Devanagari", () => {
  assert.equal(chooseReplyLanguage("मेरा नाम Bhavya है", "en"), "hi");
});

test("recognizes Romanized Hindi and Hinglish", () => {
  assert.equal(chooseReplyLanguage("mera naam Bhavya hai", "en"), "hi");
  assert.equal(chooseReplyLanguage("ki my name is Bhavya, main Jodhpur se hoon", "en"), "hi");
  assert.equal(chooseReplyLanguage("nahi, my query resolve nahi hua", "en"), "hi");
});

test("English sentences switch back to English", () => {
  assert.equal(chooseReplyLanguage("My query is not resolved", "hi"), "en");
});

test("short yes or no retains the existing reply language", () => {
  assert.equal(chooseReplyLanguage("yes", "hi"), "hi");
  assert.equal(chooseReplyLanguage("no", "en"), "en");
});
