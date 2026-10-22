// The agency's enquiry form on its own site: <script src="https://APP/embed.js" data-form="KEY"></script>.
// It puts the form in an iframe right after this tag and sizes the frame from the form's height message.
// It reads nothing from the page and sends nothing out.
(function () {
  var script = document.currentScript;
  var key = script && script.getAttribute("data-form");
  if (!script || !script.src || !/^[A-Za-z0-9_-]{38}$/.test(key || "")) return;
  var origin = new URL(script.src).origin;
  var frame = document.createElement("iframe");
  frame.title = "Enquiry form";
  frame.setAttribute("loading", "lazy");
  frame.src = origin + "/embed/" + key;
  frame.style.cssText = "width:100%;height:640px;border:0";
  script.parentNode.insertBefore(frame, script.nextSibling);
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    if (!data || data.type !== "travel-crm-form:height") return;
    if (typeof data.height !== "number" || !isFinite(data.height)) return;
    frame.style.height = Math.min(4000, Math.max(200, Math.ceil(data.height))) + "px";
  });
})();
