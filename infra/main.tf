terraform  {
  required_version = ">= 1.5.0"
  required_providers  {
    aws =  {
      source="hashicorp/aws",version="~> 5.0"
    }
    archive =  {
      source="hashicorp/archive",version="~> 2.4"
    }
  }
}
provider "aws"  {
  region=var.region
}
data "aws_caller_identity" "me"  {
}
data "aws_availability_zones" "available"  {
  state="available"
}
variable "region"  {
  type=string
  default="us-east-1"
}
variable "project"  {
  type=string
  default="mergeguard"
}
variable "scanner_image"  {
  type=string
  description="Public Docker Hub image pinned to digest, e.g. docker.io/owner/mergeguard@sha256:..."
}
variable "lab_role_arn"  {
  type=string
  description="Existing Learner Lab IAM role ARN with permissions for Lambda, ECS task/execution and S3/DDB/SQS; cannot create IAM roles in restricted labs"
}
variable "github_secret_arn"  {
  type=string
  description="Existing Secrets Manager JSON secret with webhook_secret and github_token"
}
variable "allowed_repo"  {
  type=string
  description="One public OWNER/REPO for the classroom demo"
}
variable "demo_user_sub"  {
  type=string
  description="Cognito user's sub UUID; initially use a placeholder, then apply with real sub"
}
variable "cognito_domain_prefix"  {
  type=string
  description="Globally unique Cognito hosted UI prefix"
}
variable "dashboard_callback_url"  {
  type=string
  default="http://localhost:8000/"
  description="Initial local callback; change to API Gateway dashboard URL after first apply"
}
locals  {
  tags= {
    Project=var.project,Course="CS6620"
  }
  azs=slice(data.aws_availability_zones.available.names,0,2)
}
resource "aws_vpc" "main"  {
  cidr_block="10.40.0.0/16"
  enable_dns_support=true
  enable_dns_hostnames=true
  tags=merge(local.tags, {
    Name="${var.project}-vpc"
  }
  )
}
resource "aws_internet_gateway" "igw"  {
  vpc_id=aws_vpc.main.id
  tags=local.tags
}
resource "aws_subnet" "public"  {
  count=2
  vpc_id=aws_vpc.main.id
  cidr_block=cidrsubnet(aws_vpc.main.cidr_block,8,count.index+1)
  availability_zone=local.azs[count.index]
  map_public_ip_on_launch=true
  tags=merge(local.tags, {
    Name="${var.project}-public-${count.index}"
  }
  )
}
resource "aws_subnet" "private"  {
  count=2
  vpc_id=aws_vpc.main.id
  cidr_block=cidrsubnet(aws_vpc.main.cidr_block,8,count.index+11)
  availability_zone=local.azs[count.index]
  tags=merge(local.tags, {
    Name="${var.project}-private-${count.index}"
  }
  )
}
resource "aws_eip" "nat"  {
  domain="vpc"
  tags=local.tags
  depends_on=[aws_internet_gateway.igw]
}
resource "aws_nat_gateway" "nat"  {
  allocation_id=aws_eip.nat.id
  subnet_id=aws_subnet.public[0].id
  tags=local.tags
}
resource "aws_route_table" "public"  {
  vpc_id=aws_vpc.main.id
  route  {
    cidr_block="0.0.0.0/0"
    gateway_id=aws_internet_gateway.igw.id
  }
  tags=local.tags
}
resource "aws_route_table_association" "public"  {
  count=2
  subnet_id=aws_subnet.public[count.index].id
  route_table_id=aws_route_table.public.id
}
resource "aws_route_table" "private"  {
  vpc_id=aws_vpc.main.id
  route  {
    cidr_block="0.0.0.0/0"
    nat_gateway_id=aws_nat_gateway.nat.id
  }
  tags=local.tags
}
resource "aws_route_table_association" "private"  {
  count=2
  subnet_id=aws_subnet.private[count.index].id
  route_table_id=aws_route_table.private.id
}
resource "aws_security_group" "scanner"  {
  name_prefix="${var.project}-scanner-"
  vpc_id=aws_vpc.main.id
  description="No inbound access; egress for GitHub, Docker Hub and AWS endpoints"
  egress  {
    from_port=443
    to_port=443
    protocol="tcp"
    cidr_blocks=["0.0.0.0/0"]
  }
  tags=local.tags
}
resource "aws_dynamodb_table" "jobs"  {
  name="${var.project}-jobs"
  billing_mode="PAY_PER_REQUEST"
  hash_key="scan_id"
  attribute  {
    name="scan_id"
    type="S"
  }
  attribute  {
    name="task_arn"
    type="S"
  }
  global_secondary_index  {
    name="task-index"
    hash_key="task_arn"
    projection_type="ALL"
  }
  tags=local.tags
}
resource "aws_sqs_queue" "dlq"  {
  name="${var.project}-dlq"
  tags=local.tags
}
resource "aws_sqs_queue" "jobs"  {
  name="${var.project}-jobs"
  visibility_timeout_seconds=180
  redrive_policy=jsonencode( {
    deadLetterTargetArn=aws_sqs_queue.dlq.arn,maxReceiveCount=4
  }
  )
  tags=local.tags
}
resource "aws_cloudwatch_log_group" "scanner"  {
  name="/mergeguard/scanner"
  retention_in_days=7
  tags=local.tags
}
resource "aws_ecs_cluster" "scanner"  {
  name="${var.project}-cluster"
  tags=local.tags
}
resource "aws_ecs_task_definition" "scanner"  {
  family="${var.project}-scanner"
  requires_compatibilities=["FARGATE"]
  network_mode="awsvpc"
  cpu="256"
  memory="512"
  execution_role_arn=var.lab_role_arn
  task_role_arn=var.lab_role_arn
  container_definitions=jsonencode([ {
    name="scanner",image=var.scanner_image,essential=true,readonlyRootFilesystem=true,linuxParameters= {
      initProcessEnabled=true
    }
    logConfiguration= {
      logDriver="awslogs",options= {
        "awslogs-group"=aws_cloudwatch_log_group.scanner.name,"awslogs-region"=var.region,"awslogs-stream-prefix"="task"
      }
    }
  }
  ])
  tags=local.tags
}
data "archive_file" "services"  {
  type="zip"
  source_dir="${path.module}/../services"
  output_path="${path.module}/services.zip"
  excludes=["tests"]
}
locals  {
  common_env= {
    TABLE_NAME=aws_dynamodb_table.jobs.name,QUEUE_URL=aws_sqs_queue.jobs.url,
GITHUB_SECRET_ARN=var.github_secret_arn,SCANNER_VERSION="v1",ECS_CLUSTER=aws_ecs_cluster.scanner.arn,TASK_DEFINITION=aws_ecs_task_definition.scanner.arn,PRIVATE_SUBNET_IDS=join(",",aws_subnet.private[*].id),SCANNER_SG_ID=aws_security_group.scanner.id,ALLOWED_REPO=var.allowed_repo,DEMO_USER_SUB=var.demo_user_sub,SCAN_TIMEOUT_MS="900000"
  }
}
resource "aws_lambda_function" "functions"  {
  for_each=toset(["webhook","dispatcher","completion","publisher","sweeper","status","site"])
  function_name="${var.project}-${each.key}"
  role=var.lab_role_arn
  runtime="nodejs22.x"
  handler="${each.key}.handler"
  filename=data.archive_file.services.output_path
  source_code_hash=data.archive_file.services.output_base64sha256
  timeout=each.key=="dispatcher"?60:30
  memory_size=256
  environment  {
    variables=merge(local.common_env, {
      PUBLISHER_FUNCTION="${var.project}-publisher",COGNITO_DOMAIN="${aws_cognito_user_pool_domain.users.domain}.auth.${var.region}.amazoncognito.com",COGNITO_CLIENT_ID=aws_cognito_user_pool_client.dashboard.id
    }
    )
  }
  tags=local.tags
}
resource "aws_lambda_event_source_mapping" "queue"  {
  event_source_arn=aws_sqs_queue.jobs.arn
  function_name=aws_lambda_function.functions["dispatcher"].arn
  batch_size=5
  function_response_types=["ReportBatchItemFailures"]
}
resource "aws_cloudwatch_event_rule" "stopped"  {
  name="${var.project}-ecs-stopped"
  event_pattern=jsonencode( {
    source=["aws.ecs"],"detail-type"=["ECS Task State Change"],detail= {
      clusterArn=[aws_ecs_cluster.scanner.arn],lastStatus=["STOPPED"]
    }
  }
  )
}
resource "aws_cloudwatch_event_target" "stopped"  {
  rule=aws_cloudwatch_event_rule.stopped.name
  arn=aws_lambda_function.functions["completion"].arn
}
resource "aws_lambda_permission" "stopped"  {
  statement_id="AllowEcsEvents"
  action="lambda:InvokeFunction"
  function_name=aws_lambda_function.functions["completion"].function_name
  principal="events.amazonaws.com"
  source_arn=aws_cloudwatch_event_rule.stopped.arn
}
resource "aws_cloudwatch_event_rule" "sweep"  {
  name="${var.project}-sweeper"
  schedule_expression="rate(2 minutes)"
}
resource "aws_cloudwatch_event_target" "sweep"  {
  rule=aws_cloudwatch_event_rule.sweep.name
  arn=aws_lambda_function.functions["sweeper"].arn
}
resource "aws_lambda_permission" "sweep"  {
  statement_id="AllowSweepEvents"
  action="lambda:InvokeFunction"
  function_name=aws_lambda_function.functions["sweeper"].function_name
  principal="events.amazonaws.com"
  source_arn=aws_cloudwatch_event_rule.sweep.arn
}
resource "aws_cognito_user_pool" "users"  {
  name="${var.project}-users"
  auto_verified_attributes=["email"]
  username_attributes=["email"]
  admin_create_user_config  {
    allow_admin_create_user_only=true
  }
  tags=local.tags
}
resource "aws_cognito_user_pool_domain" "users"  {
  domain=var.cognito_domain_prefix
  user_pool_id=aws_cognito_user_pool.users.id
}
resource "aws_cognito_user_pool_client" "dashboard"  {
  name="${var.project}-dashboard"
  user_pool_id=aws_cognito_user_pool.users.id
  generate_secret=false
  allowed_oauth_flows_user_pool_client=true
  allowed_oauth_flows=["code"]
  allowed_oauth_scopes=["openid","email"]
  callback_urls=[var.dashboard_callback_url]
  logout_urls=[var.dashboard_callback_url]
  supported_identity_providers=["COGNITO"]
  explicit_auth_flows=["ALLOW_REFRESH_TOKEN_AUTH"]
}
resource "aws_apigatewayv2_api" "api"  {
  name="${var.project}-api"
  protocol_type="HTTP"
  cors_configuration  {
    allow_origins=["http://localhost:8000"]
    allow_methods=["GET","POST","OPTIONS"]
    allow_headers=["authorization","content-type","x-hub-signature-256","x-github-event"]
    max_age=300
  }
  tags=local.tags
}
resource "aws_apigatewayv2_stage" "default"  {
  api_id=aws_apigatewayv2_api.api.id
  name="$default"
  auto_deploy=true
}
resource "aws_apigatewayv2_authorizer" "users"  {
  api_id=aws_apigatewayv2_api.api.id
  authorizer_type="JWT"
  name="cognito"
  identity_sources=["$request.header.Authorization"]
  jwt_configuration  {
    audience=[aws_cognito_user_pool_client.dashboard.id]
    issuer="https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.users.id}"
  }
}
resource "aws_apigatewayv2_integration" "webhook"  {
  api_id=aws_apigatewayv2_api.api.id
  integration_type="AWS_PROXY"
  integration_uri=aws_lambda_function.functions["webhook"].invoke_arn
  payload_format_version="2.0"
}
resource "aws_apigatewayv2_integration" "status"  {
  api_id=aws_apigatewayv2_api.api.id
  integration_type="AWS_PROXY"
  integration_uri=aws_lambda_function.functions["status"].invoke_arn
  payload_format_version="2.0"
}
resource "aws_apigatewayv2_integration" "site"  {
  api_id=aws_apigatewayv2_api.api.id
  integration_type="AWS_PROXY"
  integration_uri=aws_lambda_function.functions["site"].invoke_arn
  payload_format_version="2.0"
}
resource "aws_apigatewayv2_route" "site"  {
  for_each=toset(["GET /","GET /index.html","GET /app.js","GET /config.js"])
  api_id=aws_apigatewayv2_api.api.id
  route_key=each.value
  target="integrations/${aws_apigatewayv2_integration.site.id}"
}
resource "aws_apigatewayv2_route" "webhook"  {
  api_id=aws_apigatewayv2_api.api.id
  route_key="POST /webhook"
  target="integrations/${aws_apigatewayv2_integration.webhook.id}"
}
resource "aws_apigatewayv2_route" "status"  {
  for_each=toset(["GET /scans/{id}","GET /scans/{id}/report"])
  api_id=aws_apigatewayv2_api.api.id
  route_key=each.value
  target="integrations/${aws_apigatewayv2_integration.status.id}"
  authorization_type="JWT"
  authorizer_id=aws_apigatewayv2_authorizer.users.id
}
resource "aws_lambda_permission" "api"  {
  for_each=toset(["webhook","status","site"])
  statement_id="AllowApiGateway"
  action="lambda:InvokeFunction"
  function_name=aws_lambda_function.functions[each.key].function_name
  principal="apigateway.amazonaws.com"
  source_arn="${aws_apigatewayv2_api.api.execution_arn}/*"
}
resource "aws_cloudwatch_log_group" "completion"  {
  name="/aws/lambda/${var.project}-completion"
  retention_in_days=7
}
resource "aws_cloudwatch_log_metric_filter" "failures"  {
  name="${var.project}-failed"
  log_group_name=aws_cloudwatch_log_group.completion.name
  pattern="MERGEGUARD_FAILED"
  metric_transformation  {
    name="MergeGuardFailedScans"
    namespace="MergeGuard"
    value="1"
  }
}
resource "aws_cloudwatch_metric_alarm" "failures"  {
  alarm_name="${var.project}-failed-scans"
  comparison_operator="GreaterThanOrEqualToThreshold"
  evaluation_periods=1
  metric_name="MergeGuardFailedScans"
  namespace="MergeGuard"
  period=300
  statistic="Sum"
  threshold=1
  treat_missing_data="notBreaching"
}
output "api_url"  {
  value=aws_apigatewayv2_api.api.api_endpoint
}
output "dashboard_url"  {
  value="${aws_apigatewayv2_api.api.api_endpoint}/"
}
output "cognito_user_pool_id"  {
  value=aws_cognito_user_pool.users.id
}
output "cognito_client_id"  {
  value=aws_cognito_user_pool_client.dashboard.id
}
output "cognito_domain"  {
  value="${aws_cognito_user_pool_domain.users.domain}.auth.${var.region}.amazoncognito.com"
}
output "queue_url"  {
  value=aws_sqs_queue.jobs.url
}
output "table_name"  {
  value=aws_dynamodb_table.jobs.name
}
