output "deployed_apps" {
  description = "List of deployed applications"
  value = {
    node_apps = [
      for job in nomad_job.github_apps : {
        name = job.name
        id   = job.id
      }
    ]
    python_apps = [
      for job in nomad_job.python_apps : {
        name = job.name
        id   = job.id
      }
    ]
  }
}

output "app_urls" {
  description = "URLs for accessing deployed applications"
  value = {
    for repo in var.github_repositories : repo.app_name => "http://${repo.app_name}.localhost"
  }
}