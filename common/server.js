function startServer(app, serviceName, port) {
  const server = app.listen(port, () => {
    console.log(`${serviceName} running on http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`${serviceName}: port ${port} is already in use`);
      process.exit(1);
    }

    console.error(`${serviceName}: failed to start - ${error.message}`);
    process.exit(1);
  });

  return server;
}

module.exports = {
  startServer
};
