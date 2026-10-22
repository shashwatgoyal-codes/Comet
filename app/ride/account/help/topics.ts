/**
 * Help articles ("16 · Help & support"). Written for this app: they
 * describe what Comet actually does, including what's simulated.
 */
export type HelpTopic = {
  id: string;
  title: string;
  sub: string;
  questions: { q: string; a: string }[];
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "payments",
    title: "Payments & refunds",
    sub: "Wallet, UPI, cash, failed payments",
    questions: [
      {
        q: "How do I pay for a ride?",
        a: "Choose Comet Wallet, UPI, card or cash before you book. Wallet rides are paid automatically when the trip ends; UPI and card open checkout at the drop; for cash, hand it to your Pilot, who confirms it in their app. Comet uses Razorpay in test mode, so no real money ever moves.",
      },
      {
        q: "A payment failed. Was I charged?",
        a: "No. Money only moves after the server verifies a payment, so a failed or cancelled payment takes nothing. Your ride stays unpaid until you pay another way.",
      },
      {
        q: "I paid twice by mistake.",
        a: "If an online payment arrives after your Pilot already took cash, the amount is refunded to your Comet Wallet automatically.",
      },
      {
        q: "Can change from a cash payment go to my wallet?",
        a: "Yes. If your Pilot has no change, they can add the difference to your Comet Wallet when they confirm the cash.",
      },
    ],
  },
  {
    id: "cancellations",
    title: "Cancellations & fees",
    sub: "When cancelling costs ₹25, no-shows",
    questions: [
      {
        q: "When does cancelling cost money?",
        a: "Cancelling is free while we look for a Pilot and for 3 minutes after you book. After that it's ₹25, paid to the Pilot for driving to you — unless the Pilot asked you to cancel or was heading the wrong way.",
      },
      {
        q: "What's the no-show fee?",
        a: "If your Pilot waits at the pickup for 5 minutes and you don't come, they can cancel and you're charged ₹40. Waiting is free for the first 3 minutes, then ₹2 a minute.",
      },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    sub: "SOS, share trip, women Pilots only",
    questions: [
      {
        q: "What does SOS do?",
        a: "After a 3-second countdown you can cancel, SOS records an alert with your trip details and live location for Comet's safety dashboard. Comet is a portfolio project: it never calls 112, never messages your emergency contacts and never contacts anyone. In a real emergency, call 112 from your phone.",
      },
      {
        q: "How do I end an SOS?",
        a: 'Tap "I\'m safe now" and enter your 4-digit safety PIN. Demo accounts use 1234. You can set or change your PIN in Settings.',
      },
      {
        q: "How does sharing a trip work?",
        a: "Share trip creates a link anyone can open without an account. It shows the car, plate, your Pilot's first name and the area you're heading to — never phone numbers, payment details, your ride code or exact addresses. It stops working an hour after the trip.",
      },
      {
        q: "What is Women Pilots only?",
        a: "Verified women riders can choose to be matched only with verified women Pilots. In this demo the verification is simulated: nothing is uploaded.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & Comet ID",
    sub: "Comet ID, demo accounts, deleting your account",
    questions: [
      {
        q: "What is my Comet ID?",
        a: "A permanent ID like CMT-7K4Q9X, unique to you. Pilots see it on every ride, and it identifies you without sharing your phone number or email.",
      },
      {
        q: "What happens to demo accounts?",
        a: "Demo accounts are for trying Comet. They start with ₹1,240 in the wallet and two saved places, and are deleted after 24 hours.",
      },
      {
        q: "How do I delete my account?",
        a: 'Go to Settings → Delete my account and type DELETE. Your name, email, saved places and contacts are removed; past rides stay on record as "Deleted user", and your Comet ID is retired.',
      },
    ],
  },
  {
    id: "lost",
    title: "Lost items",
    sub: "Something left in the car",
    questions: [
      {
        q: "I left something in the car.",
        a: "This demo has no lost-and-found desk. In a real ride, you'd reach your Pilot through in-app chat from the trip's receipt.",
      },
    ],
  },
];
