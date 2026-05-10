FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["CjERP.Api/CjERP.Api.csproj", "CjERP.Api/"]
COPY ["CjERP.Application/CjERP.Application.csproj", "CjERP.Application/"]
COPY ["CjERP.Domain/CjERP.Domain.csproj", "CjERP.Domain/"]
COPY ["CjERP.Infrastructure/CjERP.Infrastructure.csproj", "CjERP.Infrastructure/"]
COPY ["CjERP.Shared/CjERP.Shared.csproj", "CjERP.Shared/"]

RUN dotnet restore "CjERP.Api/CjERP.Api.csproj"

COPY . .
WORKDIR /src/CjERP.Api
RUN dotnet publish "CjERP.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

COPY --from=build /app/publish .

EXPOSE 8080

ENTRYPOINT ["dotnet", "CjERP.Api.dll"]
