using CjERP.Api.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace CjERP.Api.Controllers;

[ApiController, Authorize, Route("api/mobile/version")]
public sealed class MobileVersionController(IOptions<MobileAppVersionOptions> options) : ControllerBase
{
    [HttpGet]
    public IActionResult Obtener([FromQuery] string? platform)
    {
        var settings = options.Value;
        var ios = string.Equals(platform, "ios", StringComparison.OrdinalIgnoreCase);
        var minimumVersion = ios ? settings.MinimumIos : settings.MinimumAndroid;
        var updateUrl = ios ? settings.IosUpdateUrl : settings.AndroidUpdateUrl;
        return Ok(new
        {
            success = true,
            data = new
            {
                enabled = settings.Enabled,
                minimumVersion,
                recommendedVersion = ios ? settings.RecommendedIos : settings.RecommendedAndroid,
                updateUrl,
                forceUpdate = settings.ForceUpdate && !string.IsNullOrWhiteSpace(minimumVersion) && !string.IsNullOrWhiteSpace(updateUrl),
                message = settings.Message
            }
        });
    }
}
