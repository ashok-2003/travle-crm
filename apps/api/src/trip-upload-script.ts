// The one script on the trip page: a picked screenshot or photo goes straight to storage (file bytes never pass through the
// api), through the link's own upload routes, and its attachment id is left in a hidden field for the form to send. Without
// it every form still works, just without a picture.
export const uploadScript = `
(function () {
  var base = location.pathname.replace(/\\/$/, "");
  function post(path, body) {
    return fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })
      .then(function (response) { if (!response.ok) throw new Error("refused"); return response.json(); });
  }
  function send(file, kind, travellerId) {
    var body = { kind: kind, fileName: file.name, contentType: file.type, sizeBytes: file.size };
    if (travellerId) body.travellerId = travellerId;
    return post("/upload", body).then(function (slot) {
      var headers = {};
      Object.keys(slot.upload.headers).forEach(function (name) { if (name.toLowerCase() !== "content-length") headers[name] = slot.upload.headers[name]; });
      return fetch(slot.upload.url, { method: "PUT", headers: headers, body: file }).then(function (put) {
        if (!put.ok && put.status !== 412) throw new Error("storage");
        return post("/upload/confirm", { attachmentId: slot.attachmentId });
      }).then(function () { return slot.attachmentId; });
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("input[type=file][data-kind]"), function (input) {
    var status = document.getElementById(input.getAttribute("data-status"));
    var target = document.getElementById(input.getAttribute("data-target"));
    var form = input.form;
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      status.textContent = "Adding…";
      if (form) form.setAttribute("data-busy", "yes");
      var ids = target.value ? target.value.split(",") : [];
      files.reduce(function (chain, file) {
        return chain.then(function () { return send(file, input.getAttribute("data-kind"), input.getAttribute("data-traveller")); }).then(function (id) { ids.push(id); });
      }, Promise.resolve()).then(function () {
        target.value = ids.join(",");
        status.textContent = ids.length === 1 ? "1 photo added" : ids.length + " photos added";
      }).catch(function () {
        status.textContent = "That didn't go through. Try a smaller picture, or send without it.";
      }).then(function () {
        if (form) form.removeAttribute("data-busy");
        input.value = "";
      });
    });
    if (form) form.addEventListener("submit", function (event) { if (form.getAttribute("data-busy")) event.preventDefault(); });
  });
})();
`;
