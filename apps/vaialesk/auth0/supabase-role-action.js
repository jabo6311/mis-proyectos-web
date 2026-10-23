exports.onExecutePostLogin = async (event, api) => {
  api.idToken.setCustomClaim("role", "authenticated");
  if (event.user.name) {
    api.accessToken.setCustomClaim("https://vaialesk.app/name", event.user.name);
  }
  if (event.user.email) {
    api.accessToken.setCustomClaim("https://vaialesk.app/email", event.user.email);
  }
};
