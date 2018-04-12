import { h, Component } from 'preact';

export default class NetFactorDefault extends Component {
  constructor(props) {
    super(props);
    const { eventEmitter } = props;

    let total = 0;
    let ocorrencias = 0;
    let recebidos = 0;
    let naoRecebidos = 0;

    eventEmitter.on('init', () => {
      total += 1;
      naoRecebidos += 1;
      this.setState({
        total,
        ocorrencias,
        recebidos,
        naoRecebidos,
      });
    });

    eventEmitter.on('done', (ctx) => {
      naoRecebidos -= 1;
      recebidos += 1;
      ocorrencias += (ctx.props.protesto || ctx.props.ccf
        || ctx.props.queryStatus !== 1) ? 1 : 0;
      this.setState({
        total,
        ocorrencias,
        recebidos,
        naoRecebidos,
      });
    });
  }

  render(props, {
    total, ocorrencias, recebidos, naoRecebidos,
  }) {
    return (<table width="450" align="center" border="0" className="tteladedados">
      <thead>
        <tr><th colSpan="8">Resumo dos Cheques: </th></tr>
      </thead>
      <tbody>
        <tr>
          <td nowrap=""><b>Total de Cheques : { total || 0 }</b></td>
          <td nowrap=""><b>Ocorrências: { ocorrencias || 0 }</b></td>
        </tr>
        <tr>
          <td nowrap=""><b>Recebidos : { recebidos || 0 }</b></td>
          <td nowrap=""><b>Não Recebidos: { naoRecebidos || 0 }</b></td>
        </tr>
      </tbody>
    </table>);
  }
}
