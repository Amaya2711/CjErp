using System.Data;
using CjERP.Application.DTOs.Mobile;
using CjERP.Application.Interfaces.Services;
using CjERP.Infrastructure.Persistence.Sql;
using Dapper;
namespace CjERP.Infrastructure.Services;
public sealed class MobileDeviceService(ISqlCommandFactory sql) : IMobileDeviceService
{ public Task<MobileCommandResultDto> RegistrarAsync(int emp,string user,MobileDeviceRegistrationDto req,CancellationToken ct=default)=>ExecuteAsync("dbo.sp_DispositivoMovil_Registrar",new{IdEmpleadoCj=emp,IdUsuario=user,req.PushToken,req.DeviceId,req.Plataforma,req.Modelo,req.VersionSistema,req.VersionApp},ct); public Task<MobileCommandResultDto> DesactivarAsync(int emp,string user,string device,CancellationToken ct=default)=>ExecuteAsync("dbo.sp_DispositivoMovil_Desactivar",new{IdEmpleadoCj=emp,IdUsuario=user,DeviceId=device},ct); public async Task<IReadOnlyList<MobileDeviceAdminDto>> ListarAdminAsync(bool soloActivos,int maximo,CancellationToken ct=default){await using var con=sql.CreateConnection();return (await con.QueryAsync<MobileDeviceAdminDto>(sql.Create("dbo.sp_DispositivoMovil_ListarAdmin",new{SoloActivos=soloActivos,Maximo=Math.Clamp(maximo,1,200)},CommandType.StoredProcedure,ct))).AsList();} private async Task<MobileCommandResultDto> ExecuteAsync(string sp,object p,CancellationToken ct){await using var con=sql.CreateConnection();return await con.QueryFirstOrDefaultAsync<MobileCommandResultDto>(sql.Create(sp,p,CommandType.StoredProcedure,ct))??new(){Resultado=0,Mensaje="La operación no devolvió resultado."};} }
