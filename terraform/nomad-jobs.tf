resource "nomad_job" "github_apps" {
  for_each = {
    for repo in var.github_repositories : repo.app_name => repo
    if repo.app_type == "node"
  }

  jobspec = templatefile("${path.module}/../nomad/jobs/github-app.nomad.hcl", {
    app_name      = each.value.app_name
    github_slug   = each.value.slug
    port          = each.value.port
    build_command = each.value.build_cmd
    start_command = each.value.start_cmd
  })

  detach = false
}

resource "nomad_job" "python_apps" {
  for_each = {
    for repo in var.github_repositories : repo.app_name => repo
    if repo.app_type == "python"
  }

  jobspec = templatefile("${path.module}/../nomad/jobs/python-app.nomad.hcl", {
    app_name       = each.value.app_name
    github_slug    = each.value.slug
    port           = each.value.port
    python_version = each.value.python_version
  })

  detach = false
}

resource "consul_keys" "app_config" {
  for_each = { for repo in var.github_repositories : repo.app_name => repo }

  key {
    path  = "apps/${each.value.app_name}/config"
    value = jsonencode({
      slug         = each.value.slug
      app_type     = each.value.app_type
      port         = each.value.port
      build_cmd    = each.value.build_cmd
      start_cmd    = each.value.start_cmd
      python_version = each.value.python_version
    })
  }
}