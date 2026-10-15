// Loaded into a process under test before its own code (node --import): on SIGUSR2 it leaves a promise rejected with
// nothing to handle it, as a bug would, with an error that quotes a person's data.
process.on("SIGUSR2", () => {
  void Promise.reject(new Error("asha@example.test could not be reached"));
});
