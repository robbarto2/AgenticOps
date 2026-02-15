# Template Deployment

## Trigger
Deploy template, monitoring template, deploy monitoring, new site monitoring, standard template, deploy tests

## Steps
1. List available templates (`get_templates`)
2. Present templates to the user for selection
3. Identify the target site/network for deployment
4. Deploy the selected template (`deploy_template`)
5. Verify deployment by checking new test creation

## Analysis
- **Template selection**: Match template to site type (branch, datacenter, HQ)
- **Agent availability**: Ensure target site has agents to run the deployed tests
- **Overlap**: Check if similar tests already exist for the target site to avoid duplication

## Presentation
- `data_table`: Available templates with descriptions
- `text_report`: Deployment confirmation and next steps
