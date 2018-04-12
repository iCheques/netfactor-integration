import { h } from 'preact';

export default ({ name, value }) => (<tr bgcolor="transparent">
  <td colSpan="8">
    <div style={{ display: 'block' }}>
      <table width="100%" border="0" bgcolor="transparent">
        <tbody>
          <tr style={{ backgroundColor: 'transparent' }}>
            <td width="2%"><img src="/base/tests/quebra.gif" alt="#" border="0" /></td>
            <td><b>{name}</b></td>
          </tr>
          <tr style={{ backgroundColor: 'transparent' }}>
            <td colSpan="5">{value}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </td>
</tr>);
