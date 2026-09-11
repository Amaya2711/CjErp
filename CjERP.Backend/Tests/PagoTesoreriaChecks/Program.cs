using System.ComponentModel.DataAnnotations;
using System.Data;
using CjERP.Application.DTOs;
using CjERP.Infrastructure.Persistence.Sql;
using CjERP.Infrastructure.Services;
using Dapper;
using Microsoft.Data.SqlClient;

var expected = new Dictionary<(string, int), int> {
    [("revisar",1)]=9,[("contabilidad-programar",9)]=8,[("contabilidad-administrativo",9)]=5,
    [("programar",5)]=8,[("administrativo",8)]=5,[("observar",1)]=7,[("observar",9)]=7,
    [("observar",8)]=7,[("observar",5)]=7,[("rendicion",4)]=4,[("corregir",2)]=2,[("corregir",7)]=7,
    [("subsanar",2)]=0,[("subsanar",7)]=1
};
int checks=0;
foreach(var action in new[]{"revisar","contabilidad-programar","contabilidad-administrativo","programar","administrativo","observar","rendicion","corregir","subsanar","inventada"})
foreach(var state in Enumerable.Range(0,11)) {
    if(expected.TryGetValue((action,state),out var destination)) {
        if(PagoTesoreriaService.EstadoDestino(action,state)!=destination) throw new Exception("Transición incorrecta");
    } else {
        try { PagoTesoreriaService.EstadoDestino(action,state); throw new Exception($"Transición no autorizada: {action}/{state}"); }
        catch(ArgumentException) { }
    }
    checks++;
}
var service=new PagoTesoreriaService(new NoDatabaseFactory());
PagoTesoreriaItemDto Item(int state)=>new(){Correlativo=1,IdSite="S1",Estado=state,Version=new string('A',64),TotalPagar=100};
async Task Rejected(Func<Task> action) { try{await action();throw new Exception("Se aceptó una solicitud inválida");}catch(ArgumentException){checks++;} }
foreach(var state in new[]{0,1,2,3,4,6,7,9,10})
    await Rejected(()=>service.PagarAsync(new(){EstadoOrigen=state,Items=[Item(state)]},"TEST",default));
await Rejected(()=>service.EjecutarAccionAsync(new(){Accion="observar",Items=[Item(1)]},"TEST",default));
await Rejected(()=>service.EjecutarAccionAsync(new(){Accion="rendicion",Items=[Item(4)]},"TEST",default));
await Rejected(()=>service.EjecutarAccionAsync(new(){Accion="rendicion",Items=[Item(4)],AplicarBanco=true,AplicarOperacion=true},"TEST",default));
await Rejected(()=>service.EjecutarAccionAsync(new(){Accion="subsanar",Observacion="Corregido",Items=[Item(7)],AplicarBanco=true},"TEST",default));
await Rejected(()=>service.EjecutarAccionAsync(new(){Accion="revisar",Items=[Item(1),Item(1)]},"TEST",default));
await Rejected(()=>service.EjecutarAccionAsync(new(){Accion="corregir",Observacion="Corregido",Items=[Item(7)],AplicarAdjunto=true,ImgFactura="javascript:alert(1)"},"TEST",default));
await Rejected(()=>service.EjecutarAccionAsync(new(){Accion="rendicion",Items=[Item(4)],AplicarGenerales=true,Ruc="ABC"},"TEST",default));
var results=new List<ValidationResult>();
var invalidItem=new PagoTesoreriaItemDto{Correlativo=1,IdSite="S1",Version="incorrecta"};
if(Validator.TryValidateObject(invalidItem,new ValidationContext(invalidItem),results,true))throw new Exception("Se aceptó una huella inválida");
checks++;
// La identidad de Usuario usa Empleado, mientras el permiso de Estado usa EmpleadoCj.
foreach (var id in new[] { 633, 313, 310, 299 }) {
    var permiso = PagoTesoreriaService.PermisosRevision(id, 77);
    if (!permiso.PuedeEditar || !permiso.PuedeEditarOperacion || !permiso.PuedeEditarEstado)
        throw new Exception("Editar debe habilitar NroOperacion, conservando el permiso especial de Estado");
    checks++;
}
if (PagoTesoreriaService.PermisosRevision(77, 100).PuedeEditarEstado)
    throw new Exception("Se confundió el identificador Empleado con EmpleadoCj");
checks++;
if (PagoTesoreriaService.PermisosRevision(null, 77).PuedeEditar)
    throw new Exception("Se habilitó edición sin empleado asociado");
checks++;
var normal = PagoTesoreriaService.PermisosRevision(100, 100);
var especial = PagoTesoreriaService.PermisosRevision(100, 77);
PagoRevisionDto Revision(int estado = 1) => new() { Item = Item(1), Estado = estado };
PagoTesoreriaService.ValidarRevision(Revision(), normal); checks++;
foreach (var estado in new[] { 0, 2, 4, 5, 9 }) {
    var request = Revision(estado); request.ConfirmarCambioEstado = true;
    await Rejected(() => { PagoTesoreriaService.ValidarRevision(request, normal); return Task.CompletedTask; });
}
await Rejected(() => { PagoTesoreriaService.ValidarRevision(Revision(9), especial); return Task.CompletedTask; });
var confirmado = Revision(9); confirmado.ConfirmarCambioEstado = true;
PagoTesoreriaService.ValidarRevision(confirmado, especial); checks++;
var pagado = Revision(); pagado.Item = Item(4);
await Rejected(() => { PagoTesoreriaService.ValidarRevision(pagado, especial); return Task.CompletedTask; });
var versionInvalida = Revision(); versionInvalida.Item.Version = new string('X', 64);
await Rejected(() => { PagoTesoreriaService.ValidarRevision(versionInvalida, normal); return Task.CompletedTask; });
Console.WriteLine("PASS: permisos de Revisión, identidad antigua, estado de origen, confirmación y versión.");
Console.WriteLine($"PASS: {checks} verificaciones de transiciones, bloqueo de pago desde Contabilidad, validación de bloques y datos. Sin conexión a la base de datos.");

sealed class NoDatabaseFactory:ISqlCommandFactory {
    public SqlConnection CreateConnection()=>throw new Exception("La validación debió rechazar antes de acceder a SQL");
    public CommandDefinition Create(string sql,object? parameters=null,CommandType? commandType=null,CancellationToken cancellationToken=default,int? commandTimeout=null)=>throw new NotSupportedException();
    public string ConnectionString=>"";
    public int DefaultCommandTimeoutSeconds=>30;
}
