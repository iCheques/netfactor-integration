import { render, h } from 'preact';
import ICheques from 'icheques-webintegration';
import queue from 'async/queue';
import get from 'lodash/get';
import EventEmitter from 'event-emitter';

import IChequesHeader from './icheques-header.jsx';
import IChequesInformation from './icheques-information.jsx';

const iCheques = new ICheques(window.apiKey);

const q = queue((content, callback) => {
  const {
    valor, vencimento, cmc, documento, currentNode,
  } = content;
  try {
    iCheques.chequeLegal(valor, vencimento, cmc, documento)
      .then(props => callback(null, { props, currentNode }))
      .catch(error => callback(null, { error, currentNode }));
  } catch (error) {
    callback(null, { error, currentNode });
  }
}, 2);

const cmc7Regex = /(\d{7})(\d{1})(\d{10})(\d{1})(\d{10})(\d{1})/;

let element;
export default function sendChecks() {
  if (element) {
    element.remove();
  }

  const eventEmitter = new EventEmitter();
  const consultaElement = document.getElementById('consulta');

  element = render(h(IChequesHeader, { eventEmitter }), consultaElement);
  consultaElement.prepend(element);

  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let n;

  while (n = walk.nextNode()) {
    if (!cmc7Regex.test(n.nodeValue)) continue;

    if (!n.parentElement.parentElement.getElementsByClassName('ObInputCheckBox').item(0).checked) {
      continue;
    }

    const object = {
      currentNode: n.parentElement.parentElement,
      cmc: get(n, 'nodeValue'),
      vencimento: new Date(get(n, 'parentElement.previousElementSibling.textContent').split('/').reverse().join('-')),
      valor: parseFloat(get(n, 'parentElement.previousElementSibling.previousElementSibling.textContent', '0').replace('.', '').replace(',', '.')),
      documento: get(n, 'parentElement.previousElementSibling.previousElementSibling.previousElementSibling.textContent'),
    };
    eventEmitter.emit('init', { object });
    q.push(object, (err, { props, error, currentNode }) => {
      if (error) {
        const errorContent = render(h(IChequesInformation, {
          name: 'Erro', value: error.message.toString(),
        }), document.body);
        currentNode.parentNode.insertBefore(errorContent, currentNode.nextElementSibling);
        return;
      }

      eventEmitter.emit('done', { object, props });
      const ccfContent = render(h(IChequesInformation, {
        name: 'Cheques sem Fundo',
        value: props.ccf ?
          `Localizamos ${props.ccf} cheque(s) sem fundos.` :
          'Não existem cheques sem fundos.',
      }), document.body);
      currentNode.parentNode.insertBefore(ccfContent, currentNode.nextElementSibling);

      const protestoContent = render(h(IChequesInformation, {
        name: 'Protestos',
        value: props.protesto ?
          `Localizamos ${props.protesto} protesto(s).` :
          'Não existem protestos (IEPTB).',
      }), document.body);
      currentNode.parentNode.insertBefore(protestoContent, currentNode.nextElementSibling);

      const displayContent = render(h(IChequesInformation, {
        name: 'Situação do Cheque', value: props.display.toString(),
      }), document.body);
      currentNode.parentNode.insertBefore(displayContent, currentNode.nextElementSibling);
    });
  }
}
