// A reading thread that breaks before it answers, as one whose read throws something unforeseen does (X9).
throw new Error("A thread that breaks");
