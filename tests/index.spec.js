window.apiKey = 'da45cfebfb0bf4fb8bbcd74c3e91736c';

fetch('/base/tests/sample.html')
  .then(function (data) { return data.text(); })
  .then(function (data) { document.write(data); });
